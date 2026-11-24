import { NextFunction, Request, Response } from "express";
import Part from "../models/Part";
import { cleanUpdateBody, updatedByOf, upsertByID } from "./upsert";
import { partInUse } from "./orphanParts";
import { revisionUpdate } from "./partRevision";
import { makeGetByIds } from "./getByIds";
import { makeListAll } from "./listAll";

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

/** GET /all: every part, or one page of them (see makeListAll). */
export const getAllParts = makeListAll(Part, { id: 1 }, ["name", "catalogNumber", "description", "vendor", "id"]);

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
    // The stored part: for the name below and the revision (200 vs 201 comes
    // from the write itself).
    const existing = await Part.findOne({ id: id }).lean<Record<string, any>>();

    const updateData: any = { ...cleanUpdateBody(req.body), id: id };

    // Fill in a name only when creating a part without a usable one. A partial
    // update (e.g. just file links) leaves the saved name alone.
    if (!existing && (!updateData.name || updateData.name === id)) {
      updateData.name = updateData.title || updateData.catalogNumber || (updateData.onshapeID?.partID ? `Part ${updateData.onshapeID.partID}` : "Unnamed Part");
    } else if ("name" in updateData && (!updateData.name || updateData.name === id)) {
      // Never overwrite a saved name with an empty one or the raw ID.
      delete updateData.name;
    }

    // The revision is the server's: bumped when the counted data changes (partRevision.ts).
    const revision = revisionUpdate(existing, updateData);
    const { doc: part, created } = await upsertByID(Part, id, {
      ...revision,
      $set: { ...updateData, ...updatedByOf(req), ...(revision.$set ?? {}) },
    });

    return res.status(created ? 201 : 200).json(part);
  } catch (err) {
    return next(err);
  }
}
/**
 * DELETE /id/:id: deletes a part record, but never one a BOM uses (409
 * PART_IN_USE). The one exception: the leftover part record of an assembly
 * whose standard mark was removed, which the extension deletes right after
 * saving that assembly, while its parent may still list it until it's saved.
 * Drive files are left alone. One log line per delete.
 */
export async function deletePartByID(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const id = req.params.id;
    const reason = await partInUse(id, true);
    if (reason) return res.status(409).json({ code: "PART_IN_USE", message: `This part can't be deleted: it ${reason}.` });
    const deleted = await Part.findOneAndDelete({ id: id }).lean<Record<string, any>>();
    if (!deleted) return res.status(404).json({ message: `Part ${id} not found` });
    const { _id, __v, ...record } = deleted;
    console.log(`[part delete ${res.locals.requestId}] by ${updatedByOf(req).updatedBy || "unknown"}: deleted part ${id} "${deleted.name ?? ""}"; record: ${JSON.stringify(record)}`);
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

/**
 * DELETE by Onshape key: turned off (nothing calls it; deleting goes through
 * DELETE /id/:id or the /orphans page, which check that a part isn't used).
 */
export function deletePartByOnshapeKey(req: Request<OnshapeID>, res: Response) {
  res.setHeader("Allow", "GET");
  return res.status(405).json({ message: "Deleting parts by Onshape key is turned off" });
}
/** POST /ids: the Part records with these ids. */
export const getPartsByIds = makeGetByIds(Part);
