import { NextFunction, Request, Response } from "express";
import TelemetryEvent from "../models/TelemetryEvent";

/** Most events accepted in one POST (the extension sends small batches). */
const MAX_BATCH = 200;
/** Most events returned by one GET. */
const MAX_LIST = 2000;

const text = (v: unknown, max = 200): string => (typeof v === "string" ? v.slice(0, max) : "");
const count = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};

/** Keeps only known-shaped fields, so a bad client can't store arbitrary data. */
function sanitize(raw: any) {
  const counts: Record<string, number> = {};
  if (raw?.counts && typeof raw.counts === "object") {
    for (const [kind, value] of Object.entries(raw.counts).slice(0, 20)) {
      if (/^[a-zA-Z]{1,30}$/.test(kind)) counts[kind] = count(value);
    }
  }
  const at = new Date(raw?.at);
  return {
    at: Number.isNaN(at.getTime()) ? new Date() : at,
    user: text(raw?.user),
    action: text(raw?.action, 60) || "Unknown",
    assembly: text(raw?.assembly),
    documentID: text(raw?.documentID, 40),
    elementID: text(raw?.elementID, 40),
    counts,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    failed: count(raw?.failed),
    durationMs: count(raw?.durationMs),
    ok: raw?.ok !== false,
    error: text(raw?.error, 500),
    version: text(raw?.version, 20),
  };
}

/** POST /api/telemetry/events  body: { events: [...] } */
export async function addEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    if (events.length === 0) return res.status(400).json({ message: "No events" });
    if (events.length > MAX_BATCH) return res.status(400).json({ message: `At most ${MAX_BATCH} events per request` });
    await TelemetryEvent.insertMany(events.map(sanitize), { ordered: false });
    return res.status(201).json({ saved: events.length });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/telemetry/events?limit=500&since=ISO-date  (newest first) */
export async function listEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(MAX_LIST, Math.max(1, Number(req.query.limit) || 500));
    const filter: Record<string, unknown> = {};
    const since = new Date(String(req.query.since ?? ""));
    if (!Number.isNaN(since.getTime())) filter.at = { $gte: since };
    const events = await TelemetryEvent.find(filter).sort({ at: -1 }).limit(limit).lean();
    return res.status(200).json(events);
  } catch (err) {
    return next(err);
  }
}
