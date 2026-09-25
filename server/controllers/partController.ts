import { NextFunction, Request, Response } from "express";
import { google } from "googleapis";
import Part from "../models/Part";
import onshapeService from "../services/onshapeService";
import { GoogleDriveService } from "../services/driveService";

console.log(">>> [DEBUG] PART CONTROLLER WITH DRIVE SYNC LOADED <<<");

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

// Background sync helper for parts fetched via DB routes
async function backgroundSyncPartThumbnail(partDoc: any) {
  try {
    if (!partDoc.onshapeID) return;
    const { documentID, wvmType, wvmID, elementID, partID } = partDoc.onshapeID;
    if (!documentID || !partID) return;

    console.log(">>> [SYNC] Fetching thumbnail from Onshape for part:", partID);
    const thumbnail = await onshapeService.getPartThumbnail({
      documentID,
      wvmType,
      wvmID,
      elementID,
      partID,
    });

    if (!thumbnail) return;
    const safeBuffer = ensureBuffer(thumbnail);
    if (!safeBuffer) return;

    const fileName = `part_${partID}_${Date.now()}.png`;
    const uploadedFile = await driveService.uploadFile({
      buffer: safeBuffer,
      fileName,
      mimeType: "image/png",
    });

    if (uploadedFile && uploadedFile.id) {
      console.log(">>> [SUCCESS] Uploaded part thumbnail to Google Drive! File ID:", uploadedFile.id);
      partDoc.driveFileId = uploadedFile.id;
      partDoc.imageUrl = uploadedFile.webViewLink;
      await partDoc.save();
    }
  } catch (err) {
    console.error(">>> [CRITICAL ERROR] Background part thumbnail sync failed:", err);
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
    const part = await Part.findOne({ id: id });
    if (!part) return res.status(404).json({ message: `Part ${id} not found` });

    // If driveFileId is missing, trigger Google Drive sync in the background
    if (!part.get("driveFileId")) {
      backgroundSyncPartThumbnail(part);
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