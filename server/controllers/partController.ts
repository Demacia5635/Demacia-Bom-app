import { NextFunction, Request, Response } from "express";
import { google } from "googleapis";
import Part from "../models/Part";
import onshapeService from "../services/onshapeService";
import { GoogleDriveService } from "../services/driveService";

console.log(">>> [DEBUG] PART CONTROLLER FORCED AUTO-SYNC LOADED <<<");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

if (process.env.GOOGLE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
}

const driveService = new GoogleDriveService(oauth2Client);
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

async function forceUploadToDrive(id: string, onshapeID: OnshapeID): Promise<string | null> {
  const partID = onshapeID.partID;

  if (activeUploads.has(partID)) {
    console.log(`>>> [CONCURRENCY LOCK] Awaiting upload for partID: ${partID}`);
    return activeUploads.get(partID)!;
  }

  const uploadPromise = (async () => {
    try {
      console.log(`>>> [ONSHAPE API CALL] Downloading fresh thumbnail from Onshape for partID: ${partID}...`);
      const thumbnail = await onshapeService.getPartThumbnail(onshapeID);
      if (!thumbnail) {
        console.error(`>>> [ONSHAPE ERROR] getPartThumbnail returned null for ${partID}`);
        return null;
      }

      const safeBuffer = ensureBuffer(thumbnail);
      if (!safeBuffer) {
        console.error(`>>> [BUFFER ERROR] Buffer conversion failed for ${partID}`);
        return null;
      }

      const fileName = `part_${partID}_${Date.now()}.png`;
      console.log(`>>> [UPLOADING TO DRIVE] Sending ${safeBuffer.length} bytes to Drive for partID: ${partID}...`);

      const uploaded = await driveService.uploadFile({
        buffer: safeBuffer,
        fileName: fileName,
        mimeType: "image/png",
        partID: partID,
      }).catch((err) => {
        console.error(`>>> [DRIVE UPLOAD ERROR REASON] for ${partID}:`, err?.response?.data || err?.message || err);
        return null;
      });

      if (!uploaded || !uploaded.id) {
        console.error(`>>> [DRIVE UPLOAD FAILED] uploadFile returned null for ${partID}`);
        return null;
      }

      console.log(`>>> [SUCCESS!] Uploaded file ${uploaded.id} to Google Drive for partID: ${partID}`);
      return uploaded.id;
    } catch (err: any) {
      console.error(`>>> [SYNC EXCEPTION] Exception during upload for ${partID}:`, err?.message || err);
      return null;
    } finally {
      activeUploads.delete(partID);
    }
  })();

  activeUploads.set(partID, uploadPromise);
  return uploadPromise;
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
    let part = await Part.findOne({ id: id });

    let onshapeIDObj = part?.onshapeID;
    if (!onshapeIDObj || !onshapeIDObj.documentID) {
      const parsed = parseOnshapeIDFromCompoundKey(id);
      if (parsed) onshapeIDObj = parsed;
    }

    if (!part) {
      console.log(`>>> [AUTO-CREATE] Creating document shell for part ${id}...`);
      part = new Part({ id: id, onshapeID: onshapeIDObj || undefined });
      await part.save();
    }

    if (!part.driveFileId && onshapeIDObj) {
      console.log(`>>> [TRIGGER UPLOAD] driveFileId missing for part ${id}. Executing forceUploadToDrive...`);
      const fileId = await forceUploadToDrive(id, onshapeIDObj);
      if (fileId) {
        part = await Part.findOneAndUpdate(
          { id: id },
          { 
            $set: { 
              driveFileId: fileId, 
              imageUrl: `https://lh3.googleusercontent.com/d/${fileId}`,
              onshapeID: onshapeIDObj 
            } 
          },
          { returnDocument: "after" }
        );
        console.log(`>>> [MONGO PERSISTED] Drive ID ${fileId} saved to MongoDB for part ${id}`);
      }
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