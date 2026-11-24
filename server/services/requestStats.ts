/**
 * Response times of the last requests, for the website's #/server page. In
 * memory only: a restart starts over.
 */
import type { NextFunction, Request, Response } from "express";

const KEEP = 1000;
const since = new Date().toISOString();
let total = 0;
const recent: { route: string; ms: number; error: boolean }[] = [];

/** A path segment that's an ID (an Onshape/Drive/record ID, a UUID, a file name): grouped as ":id". */
const looksLikeID = (segment: string) => segment.length >= 16 || (segment.length >= 6 && /\d/.test(segment) && /[a-z]/i.test(segment)) || segment.includes(".");

function decoded(segment: string) {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

/** The request's path with its IDs as ":id", e.g. "/api/db/part/id/:id" (stable even when no route matched). */
const routeOf = (req: Request) =>
    req.originalUrl.split("?")[0].split("/").map((segment) => (looksLikeID(decoded(segment)) ? ":id" : segment)).join("/");

/** Times each request, by method and path with IDs as ":id" (e.g. "GET /api/db/part/id/:id"). */
export function recordRequestTimes(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        const pattern = routeOf(req);
        total++;
        recent.push({ route: `${req.method} ${pattern}`, ms, error: res.statusCode >= 500 });
        if (recent.length > KEEP) recent.shift();
    });
    next();
}

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const round = (ms: number) => Math.round(ms * 10) / 10;

/** Per route over the last requests: count, 5xx errors, p50 / p95 / max in ms; slowest p95 first. */
export function requestTimes() {
    const byRoute = new Map<string, { ms: number[]; errors: number }>();
    for (const r of recent) {
        const entry = byRoute.get(r.route) ?? { ms: [], errors: 0 };
        entry.ms.push(r.ms);
        if (r.error) entry.errors++;
        byRoute.set(r.route, entry);
    }
    const routes = [...byRoute].map(([route, { ms, errors }]) => {
        const sorted = [...ms].sort((a, b) => a - b);
        return { route, count: ms.length, errors, p50: round(percentile(sorted, 0.5)), p95: round(percentile(sorted, 0.95)), maxMs: round(sorted[sorted.length - 1]) };
    }).sort((a, b) => b.p95 - a.p95);
    return { since, total, window: recent.length, routes };
}
