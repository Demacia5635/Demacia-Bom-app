import { timingSafeEqual } from "crypto";
import { NextFunction, Request, Response } from "express";
import { isConnected } from "../db/connection";
import { isAllowedOrigin, CLIENT_SECRET as CLIENT_SECRET_KEY } from "../config";

const SECRET = Buffer.from(CLIENT_SECRET_KEY);

/** Compares in constant time, so response timing doesn't reveal the secret. */
function isClientSecret(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const given = Buffer.from(value);
  return given.length === SECRET.length && timingSafeEqual(given, SECRET);
}

export function checkAuth(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;

  if (origin && !isAllowedOrigin(origin)) {
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

  // Never match an empty secret (config.ts already refuses to start without one).
  if (!CLIENT_SECRET_KEY || !isClientSecret(clientSecret)) {
    console.warn(`>>> [AUTH FAILED] Blocked route missing/invalid client secret: ${req.originalUrl}`);
    return res.status(401).json({ message: 'Invalid or missing client secrets' });
  }

  return next();
}

export function checkDBConnection(req: Request, res: Response) {
  const connected = isConnected();
  return res.status(connected ? 200 : 503).json({ connected });
}