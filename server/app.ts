import express, { Request, Response, ErrorRequestHandler, Express, NextFunction } from "express";
import cors from "cors";
import apiRoutes from './routes';
import { checkAuth } from "./controllers/healthController";
import morgan from "morgan";
import { allowedOrigins, isAllowedOrigin } from "./config";

const app: Express = express();

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, true);
        }

        if (isAllowedOrigin(origin)) {
            return callback(null, true);
        } else {
            console.warn(`>>> [CORS BLOCKED] Origin rejected: "${origin}". Allowed:`, allowedOrigins);
            return callback(null, false);
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-client-secret", "Authorization"]
}));

// Big enough for a whole BOM or a new work order with all its parts
// (the default 100 KB is about 400 work-order parts).
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

// Root route to handle Render health checks cleanly (fixes GET / 404)
app.get("/", (req: Request, res: Response) => {
    res.status(200).json({ status: "online", message: "Demacia BOM API is running" });
});

// Selective Auth Middleware: only *reading* a Drive file is public (images in
// <img> tags can't send the client secret). Deleting one still needs the secret.
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" && req.path.startsWith('/drive/file/id/')) {
        return next();
    }
    return checkAuth(req, res, next);
}, apiRoutes);

app.use((req, res) => {
    res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found`});
});

interface HttpError extends Error {
    status?: number;
}

const errorHandler: ErrorRequestHandler = (
    err: HttpError,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.error(err.stack);

    // A reply was already (partly) sent: Express's default handler closes it.
    if (res.headersSent) return next(err);

    // Bad input the client can fix (e.g. a wrong field type): say what's wrong.
    if (err.name === "ValidationError" || err.name === "CastError") {
        return res.status(400).json({ message: err.message });
    }

    // Duplicate key (a record with this id was created at the same moment):
    // a conflict the client can retry, not an internal failure.
    if ((err as { code?: number }).code === 11000) {
        return res.status(409).json({ message: "A record with this id was just created by another request. Try again." });
    }

    // Errors with a 4xx status (e.g. malformed JSON from express.json) describe
    // the request, so their message is safe to return. Anything else is an
    // internal failure whose message may expose server details: keep it in the
    // log above and send a generic message.
    const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
    res.status(status).json({
        message: status < 500 ? err.message : "Internal server error",
    });
}
app.use(errorHandler);

export default app;