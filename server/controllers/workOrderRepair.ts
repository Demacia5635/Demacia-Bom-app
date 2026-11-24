/**
 * One-off repair (admin): work-order lines saved with Priority "Finished" but
 * a status that isn't finished. The page used to link status -> priority one
 * way only, so these lines counted as finished forever. The user's rule: such
 * a line isn't finished, so its Priority goes back to "Medium".
 * (A finished status with another priority was never stuck: the status alone
 * makes it finished.)
 */
import type { NextFunction, Request, Response } from "express";
import Part from "../models/Part";
import WorkOrder from "../models/WorkOrder";
import { recordEvent, whoOf } from "../services/events";
import { updatedByOf } from "./upsert";

type Rec = Record<string, any>;

/** Stored statuses that are finished: made ("Finished Manufacturing", or the old code 4) and bought ("Finished"). */
const FINISHED_STATUSES: unknown[] = ["Finished Manufacturing", "Finished", 4, "4"];
const MAX_LISTED = 1000;

const isStuck = (line: Rec) => line?.Priority === "Finished" && !FINISHED_STATUSES.includes(line?.statusCode);

/**
 * POST /api/admin/workorders/repair-finished { dryRun }: sets Priority
 * "Medium" on every work-order line with Priority "Finished" and a status
 * that isn't finished. Leaves the lines' updatedAt alone. Running it again
 * changes nothing. { dryRun, count, lines: [{ workOrder: { id, name },
 * partID, partName, status }], updated? }.
 */
export async function repairFinished(req: Request, res: Response, next: NextFunction) {
    try {
        const dryRun = req.body?.dryRun === true;
        const orders = await WorkOrder.find({ "parts.Priority": "Finished" }, { id: 1, name: 1, parts: 1 }).lean<Rec[]>();
        const stuck = orders.flatMap((wo) => (wo.parts ?? []).filter(isStuck).map((line: Rec) => ({ wo, line })));
        const names = new Map((await Part.find({ id: { $in: [...new Set(stuck.map((s) => s.line.partID))] } }, { id: 1, name: 1 }).lean<Rec[]>())
            .map((p) => [p.id, p.name]));
        const report = {
            dryRun,
            count: stuck.length,
            lines: stuck.slice(0, MAX_LISTED).map(({ wo, line }) => ({
                workOrder: { id: wo.id, name: wo.name },
                partID: line.partID,
                partName: names.get(line.partID),
                status: line.statusCode ?? "In Planning",
            })),
        };
        if (dryRun) return res.status(200).json(report);

        // One atomic update; the filter re-checks each line, so a line fixed
        // in the meantime isn't touched and a second run changes nothing.
        const result = await WorkOrder.updateMany(
            { "parts.Priority": "Finished" },
            { $set: { "parts.$[line].Priority": "Medium" } },
            { arrayFilters: [{ "line.Priority": "Finished", "line.statusCode": { $nin: FINISHED_STATUSES } }] },
        );
        const updated = { workOrders: result.modifiedCount ?? 0, lines: stuck.length };
        const who = updatedByOf(req).updatedBy;
        console.log(`[repair finished ${res.locals.requestId}] by ${who || "unknown"}: Priority "Finished" -> "Medium" on ${stuck.length} line(s) in ${updated.workOrders} work order(s)`);
        if (stuck.length) recordEvent({
            kind: "workOrders.repairFinished", who,
            message: `${whoOf(who)} repaired ${stuck.length} work-order line(s) stuck as finished (Priority back to Medium)`,
            details: updated,
        });
        return res.status(200).json({ ...report, updated });
    } catch (err) {
        return next(err);
    }
}
