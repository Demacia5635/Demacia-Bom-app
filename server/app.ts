import express, { Request, Response, ErrorRequestHandler, Express, NextFunction } from "express";
import cors from "cors";
import apiRoutes from './routes';
import { checkAuth } from "./controllers/healthController";
import morgan from "morgan";

const app: Express = express();

// Parse comma-separated origins dynamically, trimming whitespace
const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

// Defaults for local dev and standard Render deployments
const defaultOrigins = [
    "http://localhost:5173",
    "http://localhost:5050",
    "http://127.0.0.1:5173",
];

export const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g., mobile apps, curl, server health checks)
        if (!origin) {
            return callback(null, true);
        }

        // Clean trailing slashes for accurate origin matching
        const cleanOrigin = origin.endsWith("/") ? origin.slice(0, -1) : origin;

        const isAllowed = allowedOrigins.some((allowed) => {
            const cleanAllowed = allowed.endsWith("/") ? allowed.slice(0, -1) : allowed;
            return cleanAllowed === cleanOrigin;
        });

        if (isAllowed) {
            callback(null, true);
        } else {
            console.warn(`>>> [CORS BLOCKED] Origin rejected: "${origin}". Allowed origins:`, allowedOrigins);
            callback(new Error(`CORS policy violation: Access denied for origin ${origin}`));
        }
    },
    credentials: true
}));

app.use(express.json());
app.use(morgan("dev"));

// Selective Authentication Middleware: Bypass checkAuth for Drive file image streams
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/drive/file/id/')) {
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