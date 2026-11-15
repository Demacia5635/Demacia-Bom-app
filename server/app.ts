import express, { Request, Response, ErrorRequestHandler, Express, NextFunction } from "express";
import cors from "cors";
import apiRoutes from './routes';
import { checkAuth } from "./controllers/healthController";
import morgan from "morgan";
import { allowedOrigins } from "./config";

const app: Express = express();

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, true);
        }

        const cleanOrigin = origin.endsWith("/") ? origin.slice(0, -1) : origin;

        const isAllowed = allowedOrigins.some((allowed) => {
            const cleanAllowed = allowed.endsWith("/") ? allowed.slice(0, -1) : allowed;
            return cleanAllowed === cleanOrigin;
        });

        if (isAllowed) {
            return callback(null, true);
        } else {
            console.warn(`>>> [CORS BLOCKED] Origin rejected: "${origin}". Allowed:`, allowedOrigins);
            return callback(null, false);
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-client-secret", "Authorization"]
}));

app.use(express.json());
app.use(morgan("dev"));

// Root route to handle Render health checks cleanly (fixes GET / 404)
app.get("/", (req: Request, res: Response) => {
    res.status(200).json({ status: "online", message: "Demacia BOM API is running" });
});

// Ensure preflight OPTIONS requests bypass auth checks and return 204
app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }
    next();
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

    // Bad input the client can fix (e.g. a wrong field type): say what's wrong.
    if (err.name === "ValidationError" || err.name === "CastError") {
        return res.status(400).json({ message: err.message });
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