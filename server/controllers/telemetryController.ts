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
    // Optional (newer extension versions): left out when not sent.
    errorCode: /^[A-Z0-9_]{1,64}$/.test(text(raw?.errorCode, 64)) ? text(raw?.errorCode, 64) : "",
    ...(raw?.items !== undefined ? { items: count(raw.items) } : {}),
    ...(raw?.problems !== undefined ? { problems: count(raw.problems) } : {}),
    browser: ["chrome", "firefox"].includes(text(raw?.browser, 20)) ? text(raw?.browser, 20) : "",
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

/** Days are counted in Israel time, where the team works. */
const STATS_TIMEZONE = "Asia/Jerusalem";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Longest range GET /stats covers. */
const MAX_STATS_DAYS = 366;

/**
 * GET /api/telemetry/stats?from=ISO-date&to=ISO-date (default: the last 30
 * days), aggregated in MongoDB:
 * { from, to, timezone, days: [{ day, events, requests, failed, failedEvents,
 *   byKind: { kind: n } }], users: [{ user, events, requests, failed }] }.
 * requests = Onshape requests (an event's total), failed = failed Onshape
 * requests, failedEvents = operations that ended with an error. days are
 * oldest first and only days with events; users have the most requests first.
 */
export async function getStats(req: Request, res: Response, next: NextFunction) {
  try {
    const to = req.query.to === undefined ? new Date() : new Date(String(req.query.to));
    const from = req.query.from === undefined ? new Date(to.getTime() - 30 * DAY_MS) : new Date(String(req.query.from));
    if (Number.isNaN(to.getTime())) return res.status(400).json({ message: "to must be a date", fields: ["to"] });
    if (Number.isNaN(from.getTime())) return res.status(400).json({ message: "from must be a date", fields: ["from"] });
    if (from > to) return res.status(400).json({ message: "from must be before to", fields: ["from", "to"] });
    if (to.getTime() - from.getTime() > MAX_STATS_DAYS * DAY_MS)
      return res.status(400).json({ message: `At most ${MAX_STATS_DAYS} days`, fields: ["from", "to"] });

    const day = { $dateToString: { format: "%Y-%m-%d", date: "$at", timezone: STATS_TIMEZONE } };
    const [result] = await TelemetryEvent.aggregate([
      { $match: { at: { $gte: from, $lte: to } } },
      {
        $facet: {
          days: [
            {
              $group: {
                _id: day,
                events: { $sum: 1 },
                requests: { $sum: "$total" },
                failed: { $sum: "$failed" },
                failedEvents: { $sum: { $cond: [{ $eq: ["$ok", false] }, 1, 0] } },
              },
            },
          ],
          kinds: [
            { $project: { day, kinds: { $objectToArray: { $ifNull: ["$counts", {}] } } } },
            { $unwind: "$kinds" },
            { $group: { _id: { day: "$day", kind: "$kinds.k" }, n: { $sum: "$kinds.v" } } },
          ],
          users: [
            { $group: { _id: "$user", events: { $sum: 1 }, requests: { $sum: "$total" }, failed: { $sum: "$failed" } } },
            { $sort: { requests: -1, _id: 1 } },
          ],
        },
      },
    ]);

    const byKind = new Map<string, Record<string, number>>();
    for (const k of result?.kinds ?? []) {
      const kinds = byKind.get(k._id.day) ?? {};
      kinds[k._id.kind] = k.n;
      byKind.set(k._id.day, kinds);
    }
    const days = (result?.days ?? [])
      .map((d: any) => ({ day: d._id, events: d.events, requests: d.requests, failed: d.failed, failedEvents: d.failedEvents, byKind: byKind.get(d._id) ?? {} }))
      .sort((a: { day: string }, b: { day: string }) => a.day.localeCompare(b.day));
    const users = (result?.users ?? []).map((u: any) => ({ user: u._id, events: u.events, requests: u.requests, failed: u.failed }));

    return res.status(200).json({ from, to, timezone: STATS_TIMEZONE, days, users });
  } catch (err) {
    return next(err);
  }
}
