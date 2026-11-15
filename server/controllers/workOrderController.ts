import { NextFunction, Request, Response } from "express";
import WorkOrder from "../models/WorkOrder";
import { cleanUpdateBody, upsertWithRetry } from "./upsert";

interface SubPartBody {
  partID: string;
  quantityTotal?: number;
  quantityMade?: number;
  statusCode?: number | string;
  Priority?: string;
  manufacturingMethod?: string;
  productionGCOwner?: string;
  productionMakingOwner?: string;
  comments?: string;
  links?: string;                 // Added Links interface field
  approxArrivalDate?: string;     // Added Arrival Date interface field
  lastUpdate?: Date;
  firstAdded?: Date;
}

interface WorkOrderBody {
  name?: string;
  bomID?: string;
  workOrderOwner?: string;
  description?: string;

  parts?: SubPartBody[];

  comments?: string;
  workOrderCreated?: Date;
}

export async function getAllWorkOrders(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const workOrders = await WorkOrder.find().sort({ id: 1 });
    return res.status(200).json(workOrders);
  } catch (err) {
    return next(err);
  }
}

export async function getWorkOrderByID(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.id;
    const workOrder = await WorkOrder.findOne({ id: id });
    if (!workOrder)
      return res.status(404).json({ message: `Work Order ${id} not found` });
    return res.status(200).json(workOrder);
  } catch (err) {
    return next(err);
  }
}

export async function upsertWorkOrderByID(
  req: Request<{ id: string }, unknown, WorkOrderBody>,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.id;
    const existing = await WorkOrder.findOne({ id: id });

    // `parts` is written only when the work order is created. Afterwards each
    // part changes through POST /id/:id/part, so a whole-work-order save
    // (sent with an older copy of the parts) can't undo other people's
    // per-part edits. $setOnInsert keeps this atomic.
    const { parts, ...fields } = cleanUpdateBody(req.body);
    const update: Record<string, unknown> = { $set: { ...fields, id: id } };
    if (parts !== undefined) update.$setOnInsert = { parts };

    const workOrder = await upsertWithRetry(() => WorkOrder.findOneAndUpdate(
      { id: id },
      update,
      {
        returnDocument: 'after', // Fixed deprecation warning
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ));

    return res.status(existing ? 200 : 201).json(workOrder);
  } catch (err) {
    return next(err);
  }
}

/** Per-part fields the work-order table may change (the rest come from the BOM). */
const EDITABLE_PART_FIELDS = [
  "statusCode",
  "Priority",
  "manufacturingMethod",
  "productionGCOwner",
  "productionMakingOwner",
  "comments",
  "links",
  "approxArrivalDate",
  "quantityMade",
] as const;

/**
 * Updates one part of a work order: body { partID, changes: {field: value} }.
 * Only that part's given fields (and its updatedAt) are written, so people
 * editing different parts of the same work order don't overwrite each other.
 * A part the work order doesn't list yet is added. Answers with that part.
 */
export async function updateWorkOrderPart(
  req: Request<{ id: string }, unknown, { partID?: string; changes?: Record<string, unknown> }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.id;
    const partID = typeof req.body?.partID === "string" ? req.body.partID : "";
    if (!partID) return res.status(400).json({ message: "partID is required" });

    const changes: Record<string, unknown> = {};
    for (const field of EDITABLE_PART_FIELDS) {
      if (req.body?.changes && field in req.body.changes) changes[field] = req.body.changes[field];
    }
    if (Object.keys(changes).length === 0) return res.status(400).json({ message: "No editable fields in changes" });

    const now = new Date();
    const set = Object.fromEntries(Object.entries(changes).map(([k, v]) => [`parts.$.${k}`, v]));
    let result = await WorkOrder.findOneAndUpdate(
      { id, "parts.partID": partID },
      { $set: { ...set, "parts.$.updatedAt": now } },
      { returnDocument: "after", runValidators: true },
    );

    if (!result) {
      // The part isn't in the work order yet (or the work order doesn't exist).
      result = await WorkOrder.findOneAndUpdate(
        { id, "parts.partID": { $ne: partID } },
        { $push: { parts: { partID, ...changes, createdAt: now, updatedAt: now } } },
        { returnDocument: "after", runValidators: true },
      );
      if (!result) {
        const exists = await WorkOrder.exists({ id });
        if (!exists) return res.status(404).json({ message: `Work order ${id} not found` });
        // Added by a simultaneous request: retry the update.
        return updateWorkOrderPart(req, res, next);
      }
    }

    const part = (result.parts as unknown as { partID: string }[]).find((p) => p.partID === partID);
    return res.status(200).json(part ?? null);
  } catch (err) {
    return next(err);
  }
}

export async function deleteWorkOrderByID(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.id;
    const deleted = await WorkOrder.findOneAndDelete({ id: id });

    if (!deleted)
      return res.status(404).json({ message: `Work order ${id} not found` });
    return res.status(204).json();
  } catch (err) {
    return next(err);
  }
}