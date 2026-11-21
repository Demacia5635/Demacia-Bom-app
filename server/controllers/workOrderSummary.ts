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
function workOrderLines(rootID: string, boms: Map<string, BomRecord>) {
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
    /** Lines per status name, over all lines. */
    byStatus?: Record<string, number>;
    /** Why there are no counts (the page would show the same error). */
    error?: string;
}

export async function getWorkOrderSummary(req: Request, res: Response, next: NextFunction) {
    try {
        const workOrders = await WorkOrder.find(
            {},
            { id: 1, name: 1, workOrderOwner: 1, createdAt: 1, updatedAt: 1, bomID: 1, "parts.partID": 1, "parts.statusCode": 1, "parts.Priority": 1, "parts.manufacturingMethod": 1 },
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
                { id: 1, isStandardContent: 1, markedStandard: 1, vendor: 1, manufacturingMethod: 1 },
            ).lean<Record_[]>()
            : [];
        const parts = new Map(partRecords.map((p) => [p.id, p]));

        const summaries: WorkOrderSummary[] = computed.map((c) => {
            const wo = c.wo;
            const base: WorkOrderSummary = {
                id: wo.id,
                name: wo.name,
                owner: wo.workOrderOwner,
                createdAt: wo.createdAt,
                updatedAt: wo.updatedAt,
                bomID: wo.bomID,
            };
            if (!("totals" in c) || !c.totals) return { ...base, error: c.error };

            const stored = new Map<string, Record_>((wo.parts ?? []).map((p: Record_) => [p.partID, p]));
            const counts = { lines: 0, trackedParts: 0, madeParts: 0, finishedParts: 0, madeQty: 0, finishedQty: 0, totalQty: 0 };
            const byStatus: Record<string, number> = {};

            for (const [partID, quantity] of c.totals) {
                const entry = stored.get(partID);
                const boughtBom = c.bought.get(partID);
                // The part record, or (a bought sub-assembly without one) its BOM record.
                const part = parts.get(partID) ?? (boughtBom ? { vendor: boughtBom.vendor, markedStandard: boughtBom.markedStandard } : undefined);

                const status = boughtBom && !entry ? "Untracked" : statusName(entry?.statusCode);
                const priority = entry?.Priority || "Medium";
                const method = entry?.manufacturingMethod || part?.manufacturingMethod || (boughtBom ? "Purchased" : "Manual");
                const purchased = !!part?.isStandardContent || !!part?.markedStandard
                    || (part?.vendor ?? "").trim() !== "" || method === "Purchased";
                const finished = status === "Finished Manufacturing" || priority === "Finished";
                const made = !purchased && status !== "Untracked";

                counts.lines++;
                counts.totalQty += quantity;
                byStatus[status] = (byStatus[status] || 0) + 1;
                if (status !== "Untracked") counts.trackedParts++;
                if (made) {
                    counts.madeParts++;
                    counts.madeQty += quantity;
                    if (finished) {
                        counts.finishedParts++;
                        counts.finishedQty += quantity;
                    }
                }
            }
            return { ...base, ...counts, byStatus };
        });

        return res.status(200).json(summaries);
    } catch (err) {
        return next(err);
    }
}
