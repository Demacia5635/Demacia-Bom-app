import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";
import WorkOrder from "../models/WorkOrder";
import { cleanUpdateBody, upsertByID } from "./upsert";
import { makeListAll } from "./listAll";

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

/**
 * GET /all: every work order, oldest first (IDs are UUIDs now, so they don't
 * follow creation order; older documents without createdAt come first), or
 * one page of them (see makeListAll).
 */
export const getAllWorkOrders = makeListAll(WorkOrder, { createdAt: 1, id: 1 }, ["name", "description", "workOrderOwner", "id"]);

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

/**
 * One entry per partID (the first one wins): per-part edits change only the
 * first match, so a duplicate would drift out of sync.
 */
function uniqueParts(parts: unknown): unknown {
  if (!Array.isArray(parts)) return parts; // The schema rejects it.
  const seen = new Set<unknown>();
  return parts.filter((part) => {
    const partID = (part as SubPartBody | null)?.partID;
    if (partID === undefined) return true;
    if (seen.has(partID)) return false;
    seen.add(partID);
    return true;
  });
}

export async function upsertWorkOrderByID(
  req: Request<{ id: string }, unknown, WorkOrderBody>,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.id;
    // `parts` is written only when the work order is created. Afterwards each
    // part changes through POST /id/:id/part, so a whole-work-order save
    // (sent with an older copy of the parts) can't undo other people's
    // per-part edits. $setOnInsert keeps this atomic.
    // cncGroups are written only by POST /id/:id/cncGroup, so a save sent with
    // an older copy can't undo someone's merge.
    const { parts, cncGroups: _ignored, ...fields } = cleanUpdateBody(req.body);
    const update: Record<string, unknown> = { $set: { ...fields, id: id } };
    if (parts !== undefined) update.$setOnInsert = { parts: uniqueParts(parts) };

    const { doc: workOrder, created } = await upsertByID(WorkOrder, id, update);

    return res.status(created ? 201 : 200).json(workOrder);
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
    if (!partID) return res.status(400).json({ message: "partID is required", fields: ["partID"] });

    const given: unknown = req.body?.changes;
    if (typeof given !== "object" || given === null || Array.isArray(given))
      return res.status(400).json({ message: "changes must be an object of field: value", fields: ["changes"] });
    const changes: Record<string, unknown> = {};
    for (const field of EDITABLE_PART_FIELDS) {
      if (Object.hasOwn(given, field)) changes[field] = (given as Record<string, unknown>)[field];
    }
    if (Object.keys(changes).length === 0) return res.status(400).json({ message: "No editable fields in changes", fields: ["changes"] });

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
const GROUP_ID = /^[A-Za-z0-9_-]{1,64}$/;
// Size caps: this route writes with the native driver, so no schema checks it.
const MAX_GROUP_PARTS = 500;
const MAX_PART_ID_LENGTH = 200;
const MAX_LINKS_LENGTH = 4000;

/**
 * Creates, changes or dissolves one CNC group of a work order:
 * body { groupID?, partIDs: string[], links?: string }.
 * - No groupID: a new group (the server makes its ID).
 * - partIDs: the group's parts. Left out (with a groupID) = unchanged, e.g.
 *   when only the links change. They leave any other group; a group left
 *   with fewer than 2 parts is removed, so an empty list dissolves it.
 *   A part parts[] doesn't list yet (added to the BOM after the work order
 *   was made) is added to it with the defaults, like the per-part route does.
 * - links: the shared G-code link(s); left out = unchanged ("" for a new group).
 * One atomic update, so people merging at the same time don't overwrite each
 * other. Answers with the work order's groups.
 */
export async function updateCncGroup(
  req: Request<{ id: string }, unknown, { groupID?: unknown; partIDs?: unknown; links?: unknown }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.id;
    const body = req.body ?? {};
    if (body.groupID !== undefined && (typeof body.groupID !== "string" || !GROUP_ID.test(body.groupID)))
      return res.status(400).json({ message: "groupID must be 1-64 letters, digits, - or _", fields: ["groupID"] });
    const keepParts = body.partIDs === undefined && body.groupID !== undefined;
    if (!keepParts && (!Array.isArray(body.partIDs) || !body.partIDs.every((p) => typeof p === "string" && p !== "")))
      return res.status(400).json({ message: "partIDs must be a list of part IDs", fields: ["partIDs"] });
    if (!keepParts && ((body.partIDs as string[]).length > MAX_GROUP_PARTS || (body.partIDs as string[]).some((p) => p.length > MAX_PART_ID_LENGTH)))
      return res.status(400).json({ message: `partIDs may list up to ${MAX_GROUP_PARTS} parts, each up to ${MAX_PART_ID_LENGTH} characters`, fields: ["partIDs"] });
    if (body.links !== undefined && typeof body.links !== "string")
      return res.status(400).json({ message: "links must be text", fields: ["links"] });
    if (typeof body.links === "string" && body.links.length > MAX_LINKS_LENGTH)
      return res.status(400).json({ message: `links may be up to ${MAX_LINKS_LENGTH} characters`, fields: ["links"] });
    const partIDs = keepParts ? [] : [...new Set(body.partIDs as string[])];
    const groupID = (body.groupID as string | undefined) ?? randomUUID();
    if (body.groupID === undefined && partIDs.length < 2)
      return res.status(400).json({ message: "A new group needs at least 2 parts", fields: ["partIDs"] });
    const links = body.links as string | undefined;
    const now = new Date();

    // $literal: IDs and links are values, never field paths or operators.
    const groups = { $ifNull: ["$cncGroups", []] };
    const others = {
      $map: {
        input: { $filter: { input: groups, cond: { $ne: ["$$this.id", { $literal: groupID }] } } },
        as: "g",
        in: { $mergeObjects: ["$$g", { partIDs: { $setDifference: ["$$g.partIDs", { $literal: partIDs }] } }] },
      },
    };
    const mine = { $arrayElemAt: [{ $filter: { input: groups, cond: { $eq: ["$$this.id", { $literal: groupID }] } } }, 0] };
    const updated = {
      $mergeObjects: [
        { createdAt: now, links: "" },
        { $ifNull: [mine, {}] },
        { id: { $literal: groupID }, updatedAt: now },
        keepParts ? {} : { partIDs: { $literal: partIDs } },
        links !== undefined ? { links: { $literal: links } } : {},
      ],
    };
    // Parts the work order doesn't list yet, with the schema's defaults (the
    // native driver below doesn't apply them). Only the missing ones are added.
    const newParts = new WorkOrder({
      parts: partIDs.map((partID) => ({ partID, createdAt: now, updatedAt: now })),
    }).toObject().parts;
    const addParts = {
      parts: {
        $concatArrays: [
          { $ifNull: ["$parts", []] },
          {
            $filter: {
              input: { $literal: newParts },
              cond: { $not: [{ $in: ["$$this.partID", { $ifNull: ["$parts.partID", []] }] }] },
            },
          },
        ],
      },
    };
    const pipeline = [
      {
        $set: {
          ...(partIDs.length > 0 ? addParts : {}),
          cncGroups: {
            $filter: {
              input: {
                $concatArrays: [
                  others,
                  // Links only: an existing group is updated, a missing one isn't made.
                  keepParts ? { $cond: [{ $eq: [{ $type: mine }, "object"] }, [updated], []] } : partIDs.length >= 2 ? [updated] : [],
                ],
              },
              cond: { $gte: [{ $size: "$$this.partIDs" }, 2] },
            },
          },
        },
      },
    ];

    // Native driver: one atomic pipeline update.
    const result = await WorkOrder.collection.findOneAndUpdate({ id }, pipeline, { returnDocument: "after" });
    if (!result) return res.status(404).json({ message: `Work order ${id} not found` });
    const cncGroups = (result as { cncGroups?: { id?: string }[] }).cncGroups ?? [];
    // A links-only change for a group someone removed meanwhile wasn't saved: say so.
    if (keepParts && !cncGroups.some((g) => g.id === groupID))
      return res.status(409).json({ message: "This CNC group was changed or removed by someone else; reload the page" });
    return res.status(200).json({ groupID, cncGroups });
  } catch (err) {
    return next(err);
  }
}
