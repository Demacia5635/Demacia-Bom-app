/** The data behind the website's admin pages (routes/adminRoutes.ts). */
import type { NextFunction, Request, Response } from "express";
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
