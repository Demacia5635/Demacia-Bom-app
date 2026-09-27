import { NextFunction, Request, Response } from "express";
import { google } from "googleapis";
import Part from "../models/Part";
import onshapeService from "../services/onshapeService";
import { GoogleDriveService } from "../services/driveService";

console.log(">>> [DEBUG] PART CONTROLLER WITH BULLETPROOF ATOMIC DEDUPLICATION LOADED <<<");

// Initialize Google Drive Service
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

if (process.env.GOOGLE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
}

const driveService = new GoogleDriveService(oauth2Client);

// Global in-memory lock map keyed by partID
const activeUploads = new Map<string, Promise<string | null>>();

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
}

function formID(OnshapeID: OnshapeID): string {
  return `${OnshapeID.documentID}_${OnshapeID.wvmType}_${OnshapeID.wvmID}_${OnshapeID.elementID}_${OnshapeID.partID}`;
}

function ensureBuffer(data: any): Buffer | null {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === "string") {
    if (data.startsWith("data:image")) {
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

/**
 * Atomic sync helper that prevents duplicate uploads via a strict lock and pre-flight Drive search check.
 */
async function syncAndCachePart(partDoc: any): Promise<string | null> {
  if (!partDoc.onshapeID) return null;
  const { documentID, wvmType, wvmID, elementID, partID } = partDoc.onshapeID;
  if (!documentID || !partID) return null;

  // 1. If this document already has a driveFileId, return it immediately
  if (partDoc.driveFileId) return partDoc.driveFileId;

  // 2. Check MongoDB for any other document sharing this partID that already has a driveFileId
  const existingPartInDb = await Part.findOne({
    "onshapeID.partID": partID,
    driveFileId: { $exists: true, $ne: null,$ne: "" },
  });

  if (existingPartInDb && existingPartInDb.driveFileId) {
    console.log(">>> [DB CACHE HIT] Reusing Google Drive ID for partID:", partID);
    partDoc.driveFileId = existingPartInDb.driveFileId;
    partDoc.imageUrl = existingPartInDb.imageUrl;
    await partDoc.save();
    return existingPartInDb.driveFileId;
  }

  // 3. Concurrency Lock: If an upload is already running for this partID, await it
  if (activeUploads.has(partID)) {
    console.log(">>> [CONCURRENCY LOCK] Waiting for active upload of partID:", partID);
    const resolvedFileId = await activeUploads.get(partID);
    if (resolvedFileId) {
      partDoc.driveFileId = resolvedFileId;
      await partDoc.save();
      return resolvedFileId;
    }
  }

  const uploadPromise = (async (): Promise<string | null> => {
    // 4. Pre-flight Google Drive Check: Search Drive to see if the file already exists in the folder
    const existingDriveFile = await driveService.findFileByPartID(partID);
    if (existingDriveFile) {
      console.log(">>> [DRIVE RECOVERY] Found existing file in Google Drive for partID:", partID);
      partDoc.driveFileId = existingDriveFile.id;
      partDoc.imageUrl = existingDriveFile.webViewLink;
      await partDoc.save();
      return existingDriveFile.id;
    }

    console.log(">>> [SYNC] Fetching thumbnail from Onshape for partID:", partID);
    const thumbnail = await onshapeService.getPartThumbnail({
      documentID,
      wvmType,
      wvmID,
      elementID,
      partID,
    });

    if (!thumbnail) return null;
    const safeBuffer = ensureBuffer(thumbnail);
    if (!safeBuffer) return null;

    // 5. Final safety check right before uploading: query Google Drive one last time
    // to protect against parallel async requests bypassing the initial check.
    const doubleCheckDrive = await driveService.findFileByPartID(partID);
    if (doubleCheckDrive) {
      console.log(">>> [RACE CONDITION PREVENTED] File appeared in Drive during fetch. Reusing ID:", doubleCheckDrive.id);
      partDoc.driveFileId = doubleCheckDrive.id;
      partDoc.imageUrl = doubleCheckDrive.webViewLink;
      await partDoc.save();
      return doubleCheckDrive.id;
    }

    const fileName = `part_${partID}_${Date.now()}.png`;
    const uploadedFile = await driveService.uploadFile({
      buffer: safeBuffer,
      fileName,
      mimeType: "image/png",
    });

    if (uploadedFile && uploadedFile.id) {
      console.log(">>> [SUCCESS] Uploaded unique part thumbnail to Google Drive! File ID:", uploadedFile.id);
      partDoc.driveFileId = uploadedFile.id;
      partDoc.imageUrl = uploadedFile.webViewLink;
      await partDoc.save();
      return uploadedFile.id;
    }

    return null;
  })();

  activeUploads.set(partID, uploadPromise);
  try {
    const fileId = await uploadPromise;
    return fileId;
  } finally {
    activeUploads.delete(partID);
  }
}

export async function getAllParts(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parts = await Part.find().sort({ id: 1 });
    return res.status(200).json(parts);
  } catch (err) {
    return next(err);
  }
}

export async function getPartByID(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.id;
    let part = await Part.findOne({ id: id });
    if (!part) return res.status(404).json({ message: `Part ${id} not found` });

    if (!part.driveFileId) {
      await syncAndCachePart(part);
      part = await Part.findOne({ id: id });
    }

    return res.status(200).json(part);
  } catch (err) {
    return next(err);
  }
}

export async function upsertPartByID(
  req: Request<{ id: string }, unknown, PartBody>,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.id;
    const existing = await Part.findOne({ id: id });
    const part = await Part.findOneAndUpdate(
      { id: id },
      { ...req.body, id: id },
      {
        new: true,
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

export async function deletePartByID(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.id;
    const deleted = await Part.findOneAndDelete({ id: id });

    if (!deleted)
      return res.status(404).json({ message: `Part ${id} not found` });

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

export async function getPartByOnshapeKey(
  req: Request<OnshapeID>,
  res: Response,
  next: NextFunction,
) {
  const id = formID(req.params);
  const delegateReq = req as unknown as Request<{ id: string }>;
  delegateReq.params = { id: id };
  return getPartByID(delegateReq, res, next);
}

export async function upsertPartByOnshapeKey(
  req: Request<OnshapeID, unknown, PartBody>,
  res: Response,
  next: NextFunction,
) {
  const id = formID(req.params);
  const delegateReq = req as unknown as Request<
    { id: string },
    unknown,
    PartBody
  >;
  delegateReq.params = { id: id };
  delegateReq.body = {
    ...req.body,
    onshapeID: req.params,
  };
  return upsertPartByID(delegateReq, res, next);
}

export async function deletePartByOnshapeKey(
  req: Request<OnshapeID>,
  res: Response,
  next: NextFunction,
) {
  const id = formID(req.params);
  const delegateReq = req as unknown as Request<{ id: string }>;
  delegateReq.params = { id: id };
  return deletePartByID(delegateReq, res, next);
}