// The API's access check: allowed browser origins plus the client secret.
import { timingSafeEqual } from "crypto";
import { NextFunction, Request, Response } from "express";
import { ADMIN_SECRET, isAllowedOrigin, CLIENT_SECRET as CLIENT_SECRET_KEY } from "./config";

const SECRET = Buffer.from(CLIENT_SECRET_KEY);
const ADMIN = Buffer.from(ADMIN_SECRET);

/** Compares in constant time, so response timing doesn't reveal the secret. */
function matches(value: unknown, secret: Buffer): boolean {
  if (typeof value !== "string" || secret.length === 0) return false;
  const given = Buffer.from(value);
  return given.length === secret.length && timingSafeEqual(given, secret);
}
const isClientSecret = (value: unknown) => matches(value, SECRET);

/**
 * The admin routes (on top of checkAuth): the x-admin-secret header must be
 * ADMIN_SECRET. Without ADMIN_SECRET set, or with a wrong one, they answer
 * 404 as if they didn't exist.
 */
export function checkAdmin(req: Request, res: Response, next: NextFunction) {
  if (!matches(req.headers["x-admin-secret"], ADMIN)) {
    return res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found` });
  }
  return next();
}

export function checkAuth(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;

  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({ message: 'Origin not allowed' });
  }

  // The public health check, GET /api, needs no secret. (There used to be an
  // "/auth" bypass, matched anywhere in the URL - even "?x=/auth" skipped the
  // secret. The auth routes are gone, and so is the bypass.)
  if (req.path === '/') return next();

  const clientSecret = req.headers['x-client-secret'];

  // Never match an empty secret (config.ts already refuses to start without one).
  if (!CLIENT_SECRET_KEY || !isClientSecret(clientSecret)) {
    console.warn(`>>> [AUTH FAILED] Blocked route missing/invalid client secret: ${req.originalUrl}`);
    return res.status(401).json({ message: 'Invalid or missing client secrets' });
  }

  return next();
}
