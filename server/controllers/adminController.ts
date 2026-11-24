/** The data behind the website's admin pages (routes/adminRoutes.ts). */
import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import Event from "../models/Event";
import Part from "../models/Part";
import { isOpenOrder, loadOrderLines } from "./workOrderSummary";
import { SERVER_VERSION, STARTED_AT } from "../config";
import { isConnected } from "../db/connection";
import { adminLockouts } from "../auth";
import { drive } from "../services/driveClient";
import { listJobs } from "../services/driveOrganizer";
import { requestTimes } from "../services/requestStats";

/** Drive's answer, kept for a minute (each check is a Drive request). */
const DRIVE_CHECK_MS = 60_000;
let driveStatus: { checkedAt: number; result: Record<string, unknown> } | null = null;

async function driveConnection() {
    if (!driveStatus || Date.now() - driveStatus.checkedAt > DRIVE_CHECK_MS) {
        driveStatus = { checkedAt: Date.now(), result: await drive.checkConnection() };
    }
    return { ...driveStatus.result, checkedAt: new Date(driveStatus.checkedAt).toISOString() };
}

/** GET /api/admin/status: how the server is doing (#/server). */
export async function getServerStatus(req: Request, res: Response, next: NextFunction) {
    try {
        return res.status(200).json({
            version: SERVER_VERSION,
            startedAt: STARTED_AT,
            uptimeSeconds: Math.round(process.uptime()),
            database: { connected: isConnected() },
            drive: await driveConnection(),
            organizeJobs: listJobs(),
            lockouts: adminLockouts(),
            requests: requestTimes(),
        });
    } catch (err) {
        return next(err);
    }
}

const MAX_EVENTS = 200;

/** An event as the pages get it: its id is its database id (also the `before` cursor). */
const eventOut = ({ _id, ...event }: Record<string, any>): Record<string, any> & { id: string } => ({ id: String(_id), ...event });

/** Newest first, `limit` (1-200, default 50) events, older than `before` and of `kind` when given. */
async function readEvents(req: Request, kind?: string) {
    const limit = Math.min(MAX_EVENTS, Math.max(1, Number(req.query.limit) || 50));
    const filter: Record<string, unknown> = {};
    if (kind) filter.kind = kind;
    const before = typeof req.query.before === "string" ? req.query.before : "";
    if (before) {
        if (!mongoose.isValidObjectId(before)) return null;
        filter._id = { $lt: new mongoose.Types.ObjectId(before) };
    }
    const found = await Event.find(filter).sort({ _id: -1 }).limit(limit + 1).lean<Record<string, any>[]>();
    const events = found.slice(0, limit).map(eventOut);
    return { events, next: found.length > limit ? events[events.length - 1].id : null };
}

/** GET /api/admin/events?limit=&before=&kind= (#/activity): newest first; next = the `before` for the following page. */
export async function getEvents(req: Request, res: Response, next: NextFunction) {
    try {
        const kind = typeof req.query.kind === "string" && req.query.kind ? req.query.kind : undefined;
        const page = await readEvents(req, kind);
        if (!page) return res.status(400).json({ message: "before must be an event id", fields: ["before"] });
        return res.status(200).json(page);
    } catch (err) {
        return next(err);
    }
}

/**
 * GET /api/admin/revisions?limit=&before= (#/revisions): the revision bumps,
 * newest first, each with the part now and the open work orders (not 100%
 * finished, as #/production counts) that contain it, with its status there,
 * whatever that status is.
 */
export async function getRevisions(req: Request, res: Response, next: NextFunction) {
    try {
        const page = await readEvents(req, "part.revision");
        if (!page) return res.status(400).json({ message: "before must be an event id", fields: ["before"] });
        const partIDs = [...new Set(page.events.map((e) => e.record?.id).filter(Boolean))] as string[];
        const [parts, orders] = await Promise.all([
            Part.find({ id: { $in: partIDs } }, { id: 1, name: 1, catalogNumber: 1, revision: 1 }).lean<Record<string, any>[]>(),
            page.events.length ? loadOrderLines() : Promise.resolve([]),
        ]);
        const partsByID = new Map(parts.map((p) => [p.id, p]));
        // partID -> the open work orders that contain it.
        const openByPart = new Map<string, { id: string; name?: string; status: string; method: string }[]>();
        for (const { wo, lines } of orders) {
            if (!lines || !isOpenOrder(lines)) continue;
            for (const line of lines) {
                if (!partIDs.includes(line.partID)) continue;
                const list = openByPart.get(line.partID) ?? [];
                list.push({ id: wo.id, name: wo.name, status: line.status, method: line.method });
                openByPart.set(line.partID, list);
            }
        }
        const items = page.events.map((event) => {
            const id = event.record?.id as string;
            const part = partsByID.get(id);
            return {
                event,
                part: { id, name: part?.name ?? event.record?.name, catalogNumber: part?.catalogNumber, revisionNow: part?.revision },
                openWorkOrders: openByPart.get(id) ?? [],
            };
        });
        return res.status(200).json({ items, next: page.next });
    } catch (err) {
        return next(err);
    }
}
