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

// Guessing the admin secret: every wrong try waits a second, and too many
// wrong tries lock the admin routes for a while (429, even for the right
// secret). Per client IP, and overall, since a client can fake its
// forwarded IP. In memory: a restart forgets them.
const WRONG_TRY_DELAY_MS = 1000;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const MAX_WRONG_PER_IP = 10;
const MAX_WRONG_OVERALL = 100;
const wrongTries = new Map<string, { count: number; last: number }>();
const OVERALL = "*";

/** The client's IP: the first X-Forwarded-For entry (Render's proxy adds it), else the socket's. */
function clientIP(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

/** The wrong tries of `key` in the current window (an older window is forgotten). */
function triesOf(key: string, now: number) {
  const entry = wrongTries.get(key);
  if (entry && now - entry.last > LOCK_WINDOW_MS) wrongTries.delete(key);
  return wrongTries.get(key)?.count ?? 0;
}

function recordWrongTry(key: string, now: number) {
  const entry = wrongTries.get(key) ?? { count: 0, last: now };
  entry.count++;
  entry.last = now;
  wrongTries.set(key, entry);
  // Keep the map small: forget windows that have ended.
  if (wrongTries.size > 1000) for (const [k] of wrongTries) triesOf(k, now);
}

/**
 * The admin routes (on top of checkAuth): the x-admin-secret header must be
 * ADMIN_SECRET. Without ADMIN_SECRET set, or with a wrong one, they answer
 * 404 as if they didn't exist. A wrong try answers after a second; after 10
 * wrong tries from one IP (or 100 overall) within 15 minutes, every try gets
 * 429, even with the right secret, until 15 minutes pass without one.
 */
export function checkAdmin(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const ip = clientIP(req);
  const locked = triesOf(ip, now) >= MAX_WRONG_PER_IP || triesOf(OVERALL, now) >= MAX_WRONG_OVERALL;
  if (!locked && matches(req.headers["x-admin-secret"], ADMIN)) {
    wrongTries.delete(ip);
    return next();
  }
  recordWrongTry(ip, now);
  recordWrongTry(OVERALL, now);
  if (locked) {
    console.warn(`>>> [ADMIN LOCKED] Too many wrong admin secrets (IP ${ip}): ${req.method} ${req.originalUrl}`);
    return res.status(429).json({ message: "Too many wrong admin secrets. Try again in 15 minutes." });
  }
  setTimeout(() => {
    res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found` });
  }, WRONG_TRY_DELAY_MS);
}

/** The IPs with wrong admin secrets in the current 15 minutes (for #/server). */
export function adminLockouts() {
  const now = Date.now();
  return [...wrongTries]
    .filter(([key]) => key !== OVERALL && triesOf(key, now) > 0)
    .map(([ip, { count, last }]) => ({
      ip,
      wrongTries: count,
      lastAt: new Date(last).toISOString(),
      ...(count >= MAX_WRONG_PER_IP ? { lockedUntil: new Date(last + LOCK_WINDOW_MS).toISOString() } : {}),
    }));
}

/** GET /api/admin/check: 204 when x-admin-secret is right (after checkAdmin); for the website's admin unlock. */
export function adminCheck(req: Request, res: Response) {
  return res.status(204).send();
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
