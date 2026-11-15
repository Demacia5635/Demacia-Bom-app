import { NextFunction, Request, Response } from "express";
import Part from "../models/Part";
import { cleanUpdateBody, upsertWithRetry } from "./upsert";

interface OnshapeID {
  documentID: string;
  wvmType: "w" | "v" | "m";
  wvmID: string;
  elementID: string;
  partID: string;
}

function formID(OnshapeID: OnshapeID): string {
  return `${OnshapeID.documentID}_${OnshapeID.wvmType}_${OnshapeID.wvmID}_${OnshapeID.elementID}_${OnshapeID.partID}`;
}

function parseOnshapeIDFromCompoundKey(id: string): OnshapeID | null {
  if (!id || !id.includes("_")) return null;
  const parts = id.split("_");
  if (parts.length < 5) return null;

  return {
    documentID: parts[0],
    wvmType: (parts[1] as "w" | "v" | "m") || "w",
    wvmID: parts[2],
    elementID: parts[3],
    partID: parts[4],
  };
}

export async function getAllParts(req: Request, res: Response, next: NextFunction) {
  try {
    const parts = await Part.find().sort({ id: 1 });
    return res.status(200).json(parts);
  } catch (err) {
    return next(err);
  }
}

/**
 * Read-only lookup of a saved part. 404 when there is no such part: a GET
 * never creates records (saving goes through POST /id/:id). The Onshape link
 * and identity are filled in on the response when the record lacks them.
 */
export async function getPartByID(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const id = req.params.id;
    const part = await Part.findOne({ id }).lean<Record<string, any>>();
    if (!part) return res.status(404).json({ message: `Part ${id} not found` });

    const onshapeID = part.onshapeID?.documentID ? part.onshapeID : parseOnshapeIDFromCompoundKey(id);
    if (onshapeID?.documentID) {
      const { documentID, wvmType = "w", wvmID, elementID, partID } = onshapeID;
      part.onshapeID = onshapeID;
      part.onshapeURL ||= `https://cad.onshape.com/documents/${documentID}/${wvmType}/${wvmID}/e/${elementID}?partId=${partID}`;
    }

    return res.status(200).json(part);
  } catch (err) {
    return next(err);
  }
}

// Inside partController.ts (or wherever parts are upserted/fetched)
export async function upsertPartByID(
  req: Request<{ id: string }, unknown, any>,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.id;
    const existing = await Part.findOne({ id: id });

    const updateData: any = { ...cleanUpdateBody(req.body), id: id };

    // Fill in a name only when creating a part without a usable one. A partial
    // update (e.g. just file links) leaves the saved name alone.
    if (!existing && (!updateData.name || updateData.name === id)) {
      updateData.name = updateData.title || updateData.catalogNumber || (updateData.onshapeID?.partID ? `Part ${updateData.onshapeID.partID}` : "Unnamed Part");
    } else if ("name" in updateData && (!updateData.name || updateData.name === id)) {
      // Never overwrite a saved name with an empty one or the raw ID.
      delete updateData.name;
    }

    const part = await upsertWithRetry(() => Part.findOneAndUpdate(
      { id: id },
      { $set: updateData },
      {
        returnDocument: "after",
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ));

    return res.status(existing ? 200 : 201).json(part);
  } catch (err) {
    return next(err);
  }
}
export async function deletePartByID(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const id = req.params.id;
    const deleted = await Part.findOneAndDelete({ id: id });
    if (!deleted) return res.status(404).json({ message: `Part ${id} not found` });
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

/**
 * Read-only MongoDB lookup of a part by its Onshape identity. 404 when the part
 * isn't saved. It never creates a record or triggers Drive uploads, and it never calls the Onshape API (which counts against the yearly
 * API limit). Used by the Chrome extension to tell saved parts from unsaved ones.
 */
export async function findPartByOnshapeKey(req: Request<OnshapeID>, res: Response, next: NextFunction) {
  try {
    const id = formID(req.params);
    const part = await Part.findOne({ id });
    if (!part) return res.status(404).json({ message: `Part ${id} not found` });
    return res.status(200).json(part);
  } catch (err) {
    return next(err);
  }
}

export async function deletePartByOnshapeKey(req: Request<OnshapeID>, res: Response, next: NextFunction) {
  const id = formID(req.params);
  const delegateReq = req as unknown as Request<{ id: string }>;
  delegateReq.params = { id: id };
  return deletePartByID(delegateReq, res, next);
}
/** Most IDs accepted by one batch lookup. */
const MAX_BATCH_IDS = 500;

/**
 * POST /ids  body: { ids: [...] }  -> the records that exist (any order).
 * Read-only: unlike GET /id/:id it never creates a missing record. Lets a
 * page load all of a BOM's items in one request instead of one per item.
 */
export async function getPartsByIds(req: Request, res: Response, next: NextFunction) {
    try {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id: unknown) => typeof id === "string") : [];
        if (ids.length > MAX_BATCH_IDS) return res.status(400).json({ message: `At most ${MAX_BATCH_IDS} ids per request` });
        if (ids.length === 0) return res.status(200).json([]);
        const records = await Part.find({ id: { $in: ids } });
        return res.status(200).json(records);
    } catch (err) {
        return next(err);
    }
}
