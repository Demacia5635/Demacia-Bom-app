/**
 * GET /db/workOrder/summary: every work order with its progress, for the
 * work-order list's progress bars (website QW14).
 *
 * The counts must match the work-order page, so this mirrors the website:
 * the lines are src/util/bomTree.ts's workOrderLines over the LIVE BOM tree,
 * each line's fields are built as in useWorkOrderRows.ts, and "purchased" and
 * "finished" are isPurchasedRow and isFinishedRow (useWorkOrderFilters.ts).
 * Change them together.
 *
 * Cost: one query for the work orders, one per BOM level for all of them
 * together, and one for the part records.
 */
import type { NextFunction, Request, Response } from "express";
import Part from "../models/Part";
import WorkOrder from "../models/WorkOrder";
import { loadBoms, type BomRecord } from "./bomTree";

/** Generous limits: the walk below stops at cycles itself. */
const MAX_DEPTH = 50;
const MAX_BOMS = 20_000;

type Record_ = Record<string, any>;

/** A stored status (a number in older work orders, or a name) as its name (website: parseStatusToString). */
function statusName(code: unknown): string {
    if (code === 1 || code === "1" || code === "In Planning") return "In Planning";
    if (code === 2 || code === "2" || code === "Manufacturing approved") return "Manufacturing approved";
    if (code === 3 || code === "3" || code === "In manufacturing") return "In manufacturing";
    if (code === 4 || code === "4" || code === "Finished Manufacturing") return "Finished Manufacturing";
    if (code === "Untracked") return "Untracked";
    return typeof code === "string" && code.trim() !== "" ? code : "In Planning";
}

/** Bought whole: marked standard, or with a vendor (website: isBoughtAssembly). */
const isBoughtAssembly = (bom: BomRecord | undefined) => !!bom?.markedStandard || !!bom?.vendor?.trim();

/**
 * The work-order lines (website: workOrderLines): partID -> total quantity,
 * multiplied through sub-assemblies; a bought sub-assembly is one line by its
 * BOM id. Throws the website's messages for a cycle or a missing assembly.
 */
export function workOrderLines(rootID: string, boms: Map<string, BomRecord>) {
    const totals = new Map<string, number>();
    const bought = new Map<string, BomRecord>();
    const add = (id: string, quantity: number) => totals.set(id, (totals.get(id) || 0) + quantity);

    const walk = (bomID: string, multiplier: number, path: string[]) => {
        if (path.includes(bomID))
            throw new Error(`Assembly ${bomID} contains itself (via ${path.join(" > ")}). Fix the BOM and publish it again.`);
        const bom = boms.get(bomID);
        if (!bom) throw new Error(`Assembly ${bomID} isn't saved in the database. Publish the BOM again.`);
        if (path.length > 0 && isBoughtAssembly(bom)) {
            bought.set(bomID, bom);
            add(bomID, multiplier);
            return;
        }
        const subPath = [...path, bomID];
        for (const sub of bom.subAssemblies ?? []) walk(sub.bomID, (sub.quantity ?? 1) * multiplier, subPath);
        for (const part of bom.parts ?? []) add(part.partID, (part.quantity ?? 1) * multiplier);
    };

    walk(rootID, 1, []);
    return { totals, bought };
}

export interface WorkOrderSummary {
    id: string;
    name?: string;
    owner?: string;
    createdAt?: Date;
    updatedAt?: Date;
    bomID?: string;
    /** Every line (part, or bought sub-assembly). */
    lines?: number;
    /** Lines whose status isn't Untracked. */
    trackedParts?: number;
    /** Lines the team makes: not purchased and not Untracked (the bar's denominator). */
    madeParts?: number;
    /** Made lines that are finished. */
    finishedParts?: number;
    madeQty?: number;
    finishedQty?: number;
    totalQty?: number;
    /** Made lines per status name (the same lines as madeParts). */
    byStatus?: Record<string, number>;
    /**
     * Bought lines (isPurchasedRow) by their bought status: finished = status
     * "Finished Manufacturing" or "Finished", or priority "Finished";
     * untracked = "Untracked"; toBuy = anything else.
     */
    purchased?: { lines: number; toBuy: number; finished: number; untracked: number };
    /** Why there are no counts (the page would show the same error). */
    error?: string;
}

/** One line of a work order, classified as the work-order page does. */
export interface OrderLine {
    partID: string;
    /** Total quantity through the live BOM. */
    quantity: number;
    status: string;
    priority: string;
    method: string;
    /** isPurchasedRow: bought, not made. */
    purchased: boolean;
    /** isFinishedRow. */
    finished: boolean;
    /** Made by the team: not purchased and not Untracked. */
    made: boolean;
    /** The part record's material ("" if none). */
    material: string;
    name?: string;
    catalogNumber?: string;
    /** The part's current revision (made parts). */
    revision?: number;
    /** When the part record was last saved. */
    partUpdatedAt?: Date;
}

export interface OrderLines {
    wo: Record_;
    lines?: OrderLine[];
    /** Why the lines couldn't be built (the page would show the same error). */
    error?: string;
}

/**
 * Every work order (oldest first) with its lines from the LIVE BOM, each
 * classified like the work-order page. One query for the work orders, one per
 * BOM level for all of them together, one for the part records.
 */
export async function loadOrderLines(): Promise<OrderLines[]> {
    const workOrders = await WorkOrder.find(
        {},
        {
            id: 1, name: 1, workOrderOwner: 1, createdAt: 1, updatedAt: 1, bomID: 1,
            "parts.partID": 1, "parts.statusCode": 1, "parts.Priority": 1, "parts.manufacturingMethod": 1,
            "parts.revisionAtCreation": 1, "parts.quantityAtCreation": 1,
        },
    ).sort({ createdAt: 1, id: 1 }).lean<Record_[]>();

    const rootIDs = [...new Set(workOrders.map((wo) => wo.bomID).filter((id): id is string => typeof id === "string" && id !== ""))];
    const { boms } = rootIDs.length ? await loadBoms(rootIDs, MAX_DEPTH, MAX_BOMS) : { boms: new Map<string, BomRecord>() };

    // Each work order's lines first, then one query for every part record they need.
    const computed = workOrders.map((wo) => {
        if (!wo.bomID) return { wo, error: "This work order has no assembly." };
        try {
            return { wo, ...workOrderLines(wo.bomID, boms) };
        } catch (err) {
            return { wo, error: (err as Error).message };
        }
    });
    const lineIDs = new Set<string>();
    for (const c of computed) if ("totals" in c && c.totals) for (const id of c.totals.keys()) lineIDs.add(id);
    const partRecords = lineIDs.size
        ? await Part.find(
            { id: { $in: [...lineIDs] } },
            { id: 1, name: 1, catalogNumber: 1, material: 1, revision: 1, updatedAt: 1, isStandardContent: 1, markedStandard: 1, vendor: 1, manufacturingMethod: 1 },
        ).lean<Record_[]>()
        : [];
    const parts = new Map(partRecords.map((p) => [p.id, p]));

    return computed.map((c) => {
        if (!("totals" in c) || !c.totals) return { wo: c.wo, error: c.error };
        const stored = new Map<string, Record_>((c.wo.parts ?? []).map((p: Record_) => [p.partID, p]));
        const lines: OrderLine[] = [];
        for (const [partID, quantity] of c.totals) {
            const entry = stored.get(partID);
            const boughtBom = c.bought.get(partID);
            const record = parts.get(partID);
            // The part record, or (a bought sub-assembly without one) its BOM record.
            const part = record ?? (boughtBom ? { vendor: boughtBom.vendor, markedStandard: boughtBom.markedStandard } : undefined);

            const status = boughtBom && !entry ? "Untracked" : statusName(entry?.statusCode);
            const priority = entry?.Priority || "Medium";
            const method = entry?.manufacturingMethod || part?.manufacturingMethod || (boughtBom ? "Purchased" : "Manual");
            const purchased = !!part?.isStandardContent || !!part?.markedStandard
                || (part?.vendor ?? "").trim() !== "" || method === "Purchased";
            const finished = status === "Finished Manufacturing" || priority === "Finished";
            lines.push({
                partID, quantity, status, priority, method, purchased, finished,
                made: !purchased && status !== "Untracked",
                material: typeof record?.material === "string" ? record.material.trim() : "",
                name: record?.name ?? boughtBom?.name,
                catalogNumber: record?.catalogNumber ?? boughtBom?.catalogNumber,
                ...(Number.isInteger(record?.revision) ? { revision: record!.revision } : {}),
                ...(record?.updatedAt ? { partUpdatedAt: record.updatedAt } : {}),
            });
        }
        return { wo: c.wo, lines };
    });
}

/** A bought line's status on the page: finished, untracked or to buy. */
export function boughtStatus(line: OrderLine): "finished" | "untracked" | "toBuy" {
    if (line.status === "Finished Manufacturing" || line.status === "Finished" || line.priority === "Finished") return "finished";
    if (line.status === "Untracked") return "untracked";
    return "toBuy";
}

/** The counts of one work order (GET /summary's numbers). */
export function countLines(lines: OrderLine[]) {
    const counts = { lines: 0, trackedParts: 0, madeParts: 0, finishedParts: 0, madeQty: 0, finishedQty: 0, totalQty: 0 };
    const byStatus: Record<string, number> = {};
    const bought = { lines: 0, toBuy: 0, finished: 0, untracked: 0 };
    for (const line of lines) {
        counts.lines++;
        counts.totalQty += line.quantity;
        if (line.status !== "Untracked") counts.trackedParts++;
        if (line.purchased) {
            bought.lines++;
            bought[boughtStatus(line)]++;
        }
        if (line.made) {
            byStatus[line.status] = (byStatus[line.status] || 0) + 1;
            counts.madeParts++;
            counts.madeQty += line.quantity;
            if (line.finished) {
                counts.finishedParts++;
                counts.finishedQty += line.quantity;
            }
        }
    }
    return { ...counts, byStatus, purchased: bought };
}

/** Open: not 100% finished (a made line not finished, or a bought line still to buy). */
export const isOpenOrder = (lines: OrderLine[]) =>
    lines.some((line) => (line.made && !line.finished) || (line.purchased && boughtStatus(line) === "toBuy"));

const baseOf = (wo: Record_): WorkOrderSummary => ({
    id: wo.id,
    name: wo.name,
    owner: wo.workOrderOwner,
    createdAt: wo.createdAt,
    updatedAt: wo.updatedAt,
    bomID: wo.bomID,
});

export async function getWorkOrderSummary(req: Request, res: Response, next: NextFunction) {
    try {
        const orders = await loadOrderLines();
        const summaries: WorkOrderSummary[] = orders.map(({ wo, lines, error }) =>
            lines ? { ...baseOf(wo), ...countLines(lines) } : { ...baseOf(wo), error });
        return res.status(200).json(summaries);
    } catch (err) {
        return next(err);
    }
}

/**
 * GET /api/admin/production (#/production): every work order's progress, plus
 * totals for the open ones (not 100% finished). Blocked lines: bought ones
 * still "To buy", and made ones not finished whose part has no material.
 */
export async function getProduction(req: Request, res: Response, next: NextFunction) {
    try {
        const orders = await loadOrderLines();
        const totals = {
            open: 0,
            blockedOrders: 0,
            /** Unfinished made lines of open orders, by status. */
            byStatus: {} as Record<string, number>,
            /** Unfinished made lines of open orders, by method: the queue per process. */
            byMethodOpen: {} as Record<string, number>,
            /** Open orders by owner. */
            byOwner: {} as Record<string, number>,
        };
        const result = orders.map(({ wo, lines, error }) => {
            if (!lines) return { ...baseOf(wo), error };
            const counts = countLines(lines);
            const open = isOpenOrder(lines);
            const blocked = {
                toBuy: lines.filter((l) => l.purchased && boughtStatus(l) === "toBuy").length,
                noMaterial: lines.filter((l) => l.made && !l.finished && !l.material).length,
            };
            if (open) {
                totals.open++;
                if (blocked.toBuy || blocked.noMaterial) totals.blockedOrders++;
                const owner = (wo.workOrderOwner ?? "").trim() || "(no owner)";
                totals.byOwner[owner] = (totals.byOwner[owner] ?? 0) + 1;
                for (const line of lines) {
                    if (!line.made || line.finished) continue;
                    totals.byStatus[line.status] = (totals.byStatus[line.status] ?? 0) + 1;
                    totals.byMethodOpen[line.method] = (totals.byMethodOpen[line.method] ?? 0) + 1;
                }
            }
            return {
                ...baseOf(wo),
                madeParts: counts.madeParts,
                finishedParts: counts.finishedParts,
                percent: counts.madeParts ? Math.round((counts.finishedParts / counts.madeParts) * 100) : 100,
                open,
                blocked,
                byStatus: counts.byStatus,
                purchased: counts.purchased,
            };
        });
        return res.status(200).json({ orders: result, totals });
    } catch (err) {
        return next(err);
    }
}

/**
 * A new work order's snapshot (#/stale): for each part, its revision now and
 * its total quantity through the live BOM now. Parts whose tree can't be built
 * get no quantity; standard parts no revision.
 */
export async function creationSnapshot(bomID: string | undefined, partIDs: string[]) {
    const snapshot = new Map<string, { revisionAtCreation?: number; quantityAtCreation?: number }>();
    if (!partIDs.length) return snapshot;
    let totals = new Map<string, number>();
    if (bomID) {
        try {
            const { boms } = await loadBoms([bomID], MAX_DEPTH, MAX_BOMS);
            totals = workOrderLines(bomID, boms).totals;
        } catch {
            // A tree that can't be built: no quantities (the page shows the same error).
        }
    }
    const parts = await Part.find({ id: { $in: partIDs } }, { id: 1, revision: 1 }).lean<Record_[]>();
    const revisions = new Map(parts.map((p) => [p.id, p.revision]));
    for (const id of partIDs) {
        const revision = revisions.get(id);
        const quantity = totals.get(id);
        snapshot.set(id, {
            ...(Number.isInteger(revision) ? { revisionAtCreation: revision } : {}),
            ...(quantity !== undefined ? { quantityAtCreation: quantity } : {}),
        });
    }
    return snapshot;
}

type StaleChange = {
    partID: string;
    name?: string;
    change: "revision" | "quantity" | "added" | "removed" | "edited";
    revisionAtCreation?: number;
    revisionNow?: number;
    quantityAtCreation?: number;
    quantityNow?: number;
};

/**
 * GET /api/admin/stale (#/stale): work orders whose parts changed since they
 * were created. Orders with a snapshot (created after snapshots existed) are
 * compared exactly: revision up, quantity changed, part added to or removed
 * from the BOM. Older ones (snapshot: false) only approximately: a part saved
 * after the order was created is "edited". Only orders with a change.
 */
export async function getStale(req: Request, res: Response, next: NextFunction) {
    try {
        const orders = await loadOrderLines();
        const result = [];
        for (const { wo, lines, error } of orders) {
            if (!lines) continue;
            const stored = new Map<string, Record_>((wo.parts ?? []).map((p: Record_) => [p.partID, p]));
            const hasSnapshot = (entry?: Record_) => entry?.revisionAtCreation !== undefined || entry?.quantityAtCreation !== undefined;
            const snapshot = [...stored.values()].some((entry) => hasSnapshot(entry));
            const changes: StaleChange[] = [];
            if (snapshot) {
                const now = new Set(lines.map((l) => l.partID));
                for (const line of lines) {
                    const entry = stored.get(line.partID);
                    if (!hasSnapshot(entry)) {
                        changes.push({ partID: line.partID, name: line.name, change: "added", revisionNow: line.revision, quantityNow: line.quantity });
                        continue;
                    }
                    if (entry!.revisionAtCreation !== undefined && line.revision !== undefined && line.revision > entry!.revisionAtCreation) {
                        changes.push({ partID: line.partID, name: line.name, change: "revision", revisionAtCreation: entry!.revisionAtCreation, revisionNow: line.revision });
                    }
                    if (entry!.quantityAtCreation !== undefined && line.quantity !== entry!.quantityAtCreation) {
                        changes.push({ partID: line.partID, name: line.name, change: "quantity", quantityAtCreation: entry!.quantityAtCreation, quantityNow: line.quantity });
                    }
                }
                for (const [partID, entry] of stored) {
                    if (hasSnapshot(entry) && !now.has(partID)) {
                        changes.push({ partID, change: "removed", revisionAtCreation: entry.revisionAtCreation, quantityAtCreation: entry.quantityAtCreation });
                    }
                }
            } else if (wo.createdAt) {
                const created = new Date(wo.createdAt).getTime();
                for (const line of lines) {
                    if (line.partUpdatedAt && new Date(line.partUpdatedAt).getTime() > created) {
                        changes.push({ partID: line.partID, name: line.name, change: "edited", revisionNow: line.revision });
                    }
                }
            }
            if (changes.length) {
                result.push({
                    workOrder: { id: wo.id, name: wo.name, owner: wo.workOrderOwner, bomID: wo.bomID, createdAt: wo.createdAt },
                    open: isOpenOrder(lines),
                    snapshot,
                    parts: changes,
                    ...(error ? { error } : {}),
                });
            }
        }
        return res.status(200).json(result);
    } catch (err) {
        return next(err);
    }
}
