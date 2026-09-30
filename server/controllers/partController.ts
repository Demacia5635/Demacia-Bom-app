import { NextFunction, Request, Response } from "express";
import { google } from "googleapis";
import Part from "../models/Part";
import onshapeService from "../services/onshapeService";
import { GoogleDriveService } from "../services/driveService";

console.log(">>> [DEBUG] CLEAN PART CONTROLLER LOADED <<<");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

if (process.env.GOOGLE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
}

const driveService = new GoogleDriveService(oauth2Client);

const activePartUploads = new Map<string, Promise<string | null>>();
const activeStlUploads = new Map<string, Promise<string | null>>();
const activeParasolidUploads = new Map<string, Promise<string | null>>();

interface OnshapeID {
  documentID: string;
  wvmType: "w" | "v" | "m";
  wvmID: string;
  elementID: string;
  partID: string;
}

interface PartBody {
  name?: string;
  catalogNumber?: string;
  revision?: string;
  description?: string;
  engineer?: string;
  material?: string;
  mass?: number;
  price?: number;
  productionType?: number;
  onshapeURL?: string;
  stlLink?: string;
  parasolidLink?: string;
  comments?: string;
  onshapeID?: OnshapeID;
  driveFileId?: string;
  imageUrl?: string;
  statusCode?: string;
  Priority?: string;
  manufacturingMethod?: string;
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

function ensureBuffer(data: any): Buffer | null {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === "string") {
    if (data.startsWith("data:")) {
      return Buffer.from(data.split(",")[1], "base64");
    }
    return Buffer.from(data, "base64");
  }
  if (data instanceof ArrayBuffer || data instanceof Uint8Array) return Buffer.from(data);
  if (typeof data === "object" && "data" in data && Array.isArray(data.data)) {
    return Buffer.from(data.data);
  }
  try {
    return Buffer.from(data);
  } catch (err) {
    return null;
  }
}

// 1. Thumbnail Sync to Drive
async function forceUploadToDrive(id: string, onshapeID: OnshapeID): Promise<string | null> {
  const partID = onshapeID.partID;
  if (activePartUploads.has(partID)) return activePartUploads.get(partID)!;

  const uploadPromise = (async (): Promise<string | null> => {
    try {
      const existingInDb = await Part.findOne({ "onshapeID.partID": partID, driveFileId: { $exists: true,$ne: "" } });
      if (existingInDb?.driveFileId) return existingInDb.driveFileId;

      const thumbnail = await onshapeService.getPartThumbnail(onshapeID);
      const safeBuffer = ensureBuffer(thumbnail);
      if (!safeBuffer) return null;

      const uploaded = await driveService.uploadFile({
        buffer: safeBuffer,
        fileName: `part_${partID}_${Date.now()}.png`,
        mimeType: "image/png",
        partID: partID,
      });

      return uploaded?.id || null;
    } catch (err: any) {
      console.error(`>>> [THUMBNAIL UPLOAD ERROR] ${partID}:`, err?.message || err);
      return null;
    }
  })();

  activePartUploads.set(partID, uploadPromise);
  try { return await uploadPromise; } finally { setTimeout(() => activePartUploads.delete(partID), 1000); }
}

// 2. STL Sync to Drive
async function forceUploadStlToDrive(onshapeID: OnshapeID): Promise<string | null> {
  const partID = onshapeID.partID;
  if (activeStlUploads.has(partID)) return activeStlUploads.get(partID)!;

  const uploadPromise = (async (): Promise<string | null> => {
    try {
      const existingInDb = await Part.findOne({ "onshapeID.partID": partID, stlLink: { $exists: true,$ne: "" } });
      if (existingInDb?.stlLink) return existingInDb.stlLink;

      const stlData = await onshapeService.exportPartToStl(onshapeID);
      const safeBuffer = ensureBuffer(stlData);
      if (!safeBuffer) return null;

      const folderId = process.env.GOOGLE_DRIVE_STL_FOLDER_ID;
      const uploaded = await driveService.uploadFile({
        buffer: safeBuffer,
        fileName: `part_${partID}_${Date.now()}.stl`,
        mimeType: "model/stl",
        partID: `${partID}_stl`,
        folderId: folderId,
      });

      return uploaded?.id || null;
    } catch (err: any) {
      console.error(`>>> [STL UPLOAD ERROR] ${partID}:`, err?.message || err);
      return null;
    }
  })();

  activeStlUploads.set(partID, uploadPromise);
  try { return await uploadPromise; } finally { setTimeout(() => activeStlUploads.delete(partID), 1000); }
}

// 3. Parasolid Sync to Drive
async function forceUploadParasolidToDrive(onshapeID: OnshapeID): Promise<string | null> {
  const partID = onshapeID.partID;
  if (activeParasolidUploads.has(partID)) return activeParasolidUploads.get(partID)!;

  const uploadPromise = (async (): Promise<string | null> => {
    try {
      const existingInDb = await Part.findOne({ "onshapeID.partID": partID, parasolidLink: { $exists: true,$ne: "" } });
      if (existingInDb?.parasolidLink) return existingInDb.parasolidLink;

      const parasolidData = await onshapeService.exportPartToParasolid(onshapeID);
      const safeBuffer = ensureBuffer(parasolidData);
      if (!safeBuffer) return null;

      const folderId = process.env.GOOGLE_DRIVE_PARASOLID_FOLDER_ID;
      const uploaded = await driveService.uploadFile({
        buffer: safeBuffer,
        fileName: `part_${partID}_${Date.now()}.x_t`,
        mimeType: "application/x-parasolid",
        partID: `${partID}_parasolid`,
        folderId: folderId,
      });

      return uploaded?.id || null;
    } catch (err: any) {
      console.error(`>>> [PARASOLID UPLOAD ERROR] ${partID}:`, err?.message || err);
      return null;
    }
  })();

  activeParasolidUploads.set(partID, uploadPromise);
  try { return await uploadPromise; } finally { setTimeout(() => activeParasolidUploads.delete(partID), 1000); }
}

export async function getAllParts(req: Request, res: Response, next: NextFunction) {
  try {
    const parts = await Part.find().sort({ id: 1 });
    return res.status(200).json(parts);
  } catch (err) {
    return next(err);
  }
}

export async function getPartByID(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const id = req.params.id;
    const onshapeIDObj = parseOnshapeIDFromCompoundKey(id);

    // Atomically find or create using findOneAndUpdate (no manual .save() required)
    let part = await Part.findOneAndUpdate(
      { id: id },
      { $setOnInsert: { id: id, onshapeID: onshapeIDObj || undefined } },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
    );

    let updatedFields: any = {};
    const effectiveOnshapeID = onshapeIDObj || part?.onshapeID;

    if (effectiveOnshapeID && effectiveOnshapeID.documentID) {
      const { documentID, wvmType = "w", wvmID, elementID, partID } = effectiveOnshapeID;
      updatedFields.onshapeURL = `https://cad.onshape.com/documents/${documentID}/${wvmType}/${wvmID}/e/${elementID}?partId=${partID}`;
      updatedFields.onshapeID = effectiveOnshapeID;

      // Trigger async background tasks for Drive assets if missing
      if (!part.driveFileId) {
        forceUploadToDrive(id, effectiveOnshapeID).then((fileId) => {
          if (fileId) {
            Part.updateOne({ id: id }, { $set: { driveFileId: fileId, imageUrl: `https://lh3.googleusercontent.com/d/${fileId}` } }).catch(() => {});
          }
        }).catch(() => {});
      }

      if (!part.stlLink) {
        forceUploadStlToDrive(effectiveOnshapeID).then((stlId) => {
          if (stlId) {
            Part.updateOne({ id: id }, { $set: { stlLink: stlId } }).catch(() => {});
          }
        }).catch(() => {});
      }

      if (!part.parasolidLink) {
        forceUploadParasolidToDrive(effectiveOnshapeID).then((parasolidId) => {
          if (parasolidId) {
            Part.updateOne({ id: id }, { $set: { parasolidLink: parasolidId } }).catch(() => {});
          }
        }).catch(() => {});
      }
    }

    if (Object.keys(updatedFields).length > 0) {
      part = await Part.findOneAndUpdate(
        { id: id },
        { $set: updatedFields },
        { returnDocument: "after", upsert: true }
      );
    }

    return res.status(200).json(part);
  } catch (err) {
    return next(err);
  }
}

export async function upsertPartByID(req: Request<{ id: string }, unknown, PartBody>, res: Response, next: NextFunction) {
  try {
    const id = req.params.id;
    const existing = await Part.findOne({ id: id });

    const updateData: any = { ...req.body, id: id };
    if (!updateData.onshapeID) {
      const parsed = parseOnshapeIDFromCompoundKey(id);
      if (parsed) updateData.onshapeID = parsed;
    }

    const part = await Part.findOneAndUpdate(
      { id: id },
      { $set: updateData },
      {
        returnDocument: "after",
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

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

export async function getPartByOnshapeKey(req: Request<OnshapeID>, res: Response, next: NextFunction) {
  const id = formID(req.params);
  const delegateReq = req as unknown as Request<{ id: string }>;
  delegateReq.params = { id: id };
  return getPartByID(delegateReq, res, next);
}

export async function upsertPartByOnshapeKey(req: Request<OnshapeID, unknown, PartBody>, res: Response, next: NextFunction) {
  const id = formID(req.params);
  const delegateReq = req as unknown as Request<{ id: string }, unknown, PartBody>;
  delegateReq.params = { id: id };
  delegateReq.body = { ...req.body, onshapeID: req.params };
  return upsertPartByID(delegateReq, res, next);
}

export async function deletePartByOnshapeKey(req: Request<OnshapeID>, res: Response, next: NextFunction) {
  const id = formID(req.params);
  const delegateReq = req as unknown as Request<{ id: string }>;
  delegateReq.params = { id: id };
  return deletePartByID(delegateReq, res, next);
}