import express, { Request, Response, ErrorRequestHandler, Express, NextFunction } from "express";
import cors from "cors";
import apiRoutes from './routes';
import { checkAuth } from "./controllers/healthController";
import morgan from "morgan";

const app: Express = express();

const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const defaultOrigins = [
    "http://localhost:5173",
    "http://localhost:5050",
    "http://127.0.0.1:5173",
];

export const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

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
    allowedHeaders: ["Content-Type", "x-client-secret", "x-username", "Authorization"]
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

// Selective Auth Middleware: Bypass checkAuth for public Drive streams and Auth routes
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/drive/file/id/') || req.path.startsWith('/auth/')) {
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
    res.status(err.status || 500).json({ message: err.message || "Internal server error" });
}
app.use(errorHandler);

export default app;