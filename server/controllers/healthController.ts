import { NextFunction, Request, Response } from "express";
import { isConnected } from "../db/connection";
import { allowedOrigins, CLIENT_SECRET as CLIENT_SECRET_KEY } from "../config";

export function checkAuth(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;

  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ message: 'Origin not allowed' });
  }

  // Public health checks only. (There used to be an "/auth" bypass, matched
  // anywhere in the URL - even "?x=/auth" skipped the secret. The auth routes
  // are gone, and so is the bypass.)
  if (req.path === '/health' || req.path === '/') {
    console.log(`>>> [AUTH BYPASS] Allowing public route: ${req.originalUrl}`);
    return next();
  }

  const clientSecret = req.headers['x-client-secret'];

  if (clientSecret !== CLIENT_SECRET_KEY) {
    console.warn(`>>> [AUTH FAILED] Blocked route missing/invalid client secret: ${req.originalUrl}`);
    return res.status(401).json({ message: 'Invalid or missing client secrets' });
  }

  return next();
}

export function checkDBConnection(req: Request, res: Response) {
  const connected = isConnected();
  return res.status(connected ? 200 : 503).json({ connected });
}