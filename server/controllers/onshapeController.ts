import { Request, Response } from "express";
import { google } from "googleapis";
import Part from "../models/Part";
import Bom from "../models/Bom";
import onshapeService, {
  OnshapeApiError,
  UnsupportedOnshapeOperationError,
} from "../services/onshapeService";
import { GoogleDriveService } from "../services/driveService";
import { getOnshapeKeysFromRequest } from "../../src/util/sec/onshapeKeys";

console.log(">>> [DEBUG] ONSHAPE CONTROLLER WITH PER-USER MULTI-TENANT KEYS LOADED <<<");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

if (process.env.GOOGLE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
}

const driveService = new GoogleDriveService(oauth2Client);
const activePartUploads = new Map<string, Promise<{ id: string; webViewLink?: string } | null>>();
const activeElementUploads = new Map<string, Promise<{ id: string; webViewLink?: string } | null>>();

interface OnshapePartParams {
  documentID: string;
  wvmType: string;
  wvmID: string;
  elementID: string;
  partID: string;
}

interface OnshapeBomParams {
  documentID: string;
  wvmType: string;
  wvmID: string;
  elementID: string;
}

function formPartID(params: OnshapePartParams): string {
  return `${params.documentID}_${params.wvmType}_${params.wvmID}_${params.elementID}_${params.partID}`;
}

function formBomID(params: OnshapeBomParams): string {
  return `${params.documentID}_${params.wvmType}_${params.wvmID}_${params.elementID}`;
}

function handleOnshapeError(
  res: Response,
  err: unknown,
  fallbackMessage: string,
): Response {
  console.error(">>> [DEBUG] handleOnshapeError caught:", err);
  if (err instanceof UnsupportedOnshapeOperationError) {
    return res.status(501).json({ message: err.message });
  }
  if (err instanceof OnshapeApiError) {
    return res
      .status(err.status)
      .json({ message: err.message, onshapeResponse: err.body });
  }
  const message = err instanceof Error ? err.message : String(err);
  return res.status(502).json({ message: fallbackMessage, error: message });
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

async function syncPartThumbnailToDrive(
  req: Request,
  params: OnshapePartParams,
  size?: string
): Promise<{ id: string; webViewLink?: string } | null> {
  const dbId = formPartID(params);
  const userKeys = await getOnshapeKeysFromRequest(req);

  const existingDoc = await Part.findOne({ id: dbId });
  if (existingDoc && existingDoc.driveFileId) {
    return { id: existingDoc.driveFileId, webViewLink: existingDoc.imageUrl };
  }

  if (activePartUploads.has(dbId)) {
    return activePartUploads.get(dbId)!;
  }

  const uploadPromise = (async () => {
    try {
      const thumbnail = await onshapeService.getPartThumbnail(params, size, userKeys);
      if (!thumbnail) return null;

      const safeBuffer = ensureBuffer(thumbnail);
      if (!safeBuffer) return null;

      const fileName = `part_${params.documentID}_${params.partID}_${Date.now()}.png`;
      const uploadedFile = await driveService.uploadFile({
        buffer: safeBuffer,
        fileName: fileName,
        mimeType: "image/png",
        partID: params.partID,
      }).catch((err) => {
        console.error(`>>> [DRIVE UPLOAD ERROR] Part ${params.partID}:`, err?.message || err);
        return null;
      });

      if (!uploadedFile || !uploadedFile.id) return null;

      await Part.findOneAndUpdate(
        { id: dbId },
        {
          $set: {
            driveFileId: uploadedFile.id,
            imageUrl: uploadedFile.webViewLink || `https://lh3.googleusercontent.com/d/${uploadedFile.id}`,
            onshapeID: params,
          },
        },
        { returnDocument: "after", upsert: true }
      ).catch(() => {});

      return uploadedFile;
    } catch (err: any) {
      console.error(`>>> [SYNC EXCEPTION] Part ${params.partID}:`, err?.message || err);
      return null;
    } finally {
      setTimeout(() => activePartUploads.delete(dbId), 1000);
    }
  })();

  activePartUploads.set(dbId, uploadPromise);
  return uploadPromise;
}

async function syncElementThumbnailToDrive(
  req: Request,
  params: OnshapeBomParams,
  size?: string
): Promise<{ id: string; webViewLink?: string } | null> {
  const elementID = params.elementID;
  const dbIdPrefix = formBomID(params);
  const userKeys = await getOnshapeKeysFromRequest(req);

  const existingDoc = await Bom.findOne({ id: { $regex: `^${dbIdPrefix}` }, driveFileId: { $exists: true,$ne: "" } });
  if (existingDoc && existingDoc.driveFileId) {
    return { id: existingDoc.driveFileId, webViewLink: existingDoc.imageUrl };
  }

  if (activeElementUploads.has(elementID)) {
    return activeElementUploads.get(elementID)!;
  }

  const uploadPromise = (async () => {
    try {
      const thumbnail = await onshapeService.getElementThumbnail(params, size, userKeys);
      if (!thumbnail) return null;

      const safeBuffer = ensureBuffer(thumbnail);
      if (!safeBuffer) return null;

      const fileName = `element_${elementID}_${Date.now()}.png`;
      const uploadedFile = await driveService.uploadFile({
        buffer: safeBuffer,
        fileName: fileName,
        mimeType: "image/png",
      }).catch((err) => {
        console.error(`>>> [DRIVE UPLOAD ERROR] Element ${elementID}:`, err?.message || err);
        return null;
      });

      if (!uploadedFile || !uploadedFile.id) return null;

      await Bom.updateMany(
        { id: { $regex: `^${dbIdPrefix}` } },
        {
          $set: {
            driveFileId: uploadedFile.id,
            imageUrl: uploadedFile.webViewLink || `https://lh3.googleusercontent.com/d/${uploadedFile.id}`,
            onshapeID: params,
          },
        }
      ).catch(() => {});

      return uploadedFile;
    } catch (err: any) {
      console.error(`>>> [SYNC EXCEPTION] Element ${elementID}:`, err?.message || err);
      return null;
    } finally {
      setTimeout(() => activeElementUploads.delete(elementID), 1000);
    }
  })();

  activeElementUploads.set(elementID, uploadPromise);
  return uploadPromise;
}

export async function checkConnection(req: Request, res: Response) {
  try {
    const userKeys = await getOnshapeKeysFromRequest(req);
    const connected = await onshapeService.checkConnection(userKeys);
    return res.status(connected ? 200 : 503).json({ connected });
  } catch (err: any) {
    return res.status(401).json({ message: err.message });
  }
}

export async function getPart(req: Request<OnshapePartParams>, res: Response) {
  try {
    const userKeys = await getOnshapeKeysFromRequest(req);
    const part = await onshapeService.getPartForDb(req.params, userKeys);

    if (part && !(part as any).driveFileId) {
      syncPartThumbnailToDrive(req, req.params).catch(() => {});
    }

    return res.status(200).json(part);
  } catch (err) {
    return handleOnshapeError(res, err, "Failed to fetch part from Onshape");
  }
}

export async function updatePart(
  req: Request<OnshapePartParams, unknown, Record<string, unknown>>,
  res: Response,
) {
  try {
    const userKeys = await getOnshapeKeysFromRequest(req);
    const part = await onshapeService.updatePart(req.params, req.body, userKeys);
    return res.status(200).json(part);
  } catch (err) {
    return handleOnshapeError(res, err, "Failed to update part in Onshape");
  }
}

export async function getBom(req: Request<OnshapeBomParams>, res: Response) {
  try {
    const userKeys = await getOnshapeKeysFromRequest(req);
    const bom = await onshapeService.getBom(req.params, userKeys);
    return res.status(200).json(bom["bomTable"]);
  } catch (err) {
    return handleOnshapeError(res, err, "Failed to fetch bom from Onshape");
  }
}

export async function updateBom(
  req: Request<
    OnshapeBomParams, 
    unknown, 
    { 
      properties: Array<{ propertyId: string; value: unknown }> 
    } | Record<string, unknown>>,
  res: Response
) {
  try {
    const userKeys = await getOnshapeKeysFromRequest(req);
    const assembly = await onshapeService.updateAssembly(req.params, req.body, userKeys);
    return res.status(200).json(assembly);
  } catch (err) {
    return handleOnshapeError(res, err, "Failed to update assembly in Onshape");
  }
}

export async function getPartThumbnail(
  req: Request<OnshapePartParams & { size?: string }>,
  res: Response,
) {
  try {
    const userKeys = await getOnshapeKeysFromRequest(req);
    const dbId = formPartID(req.params);
    let driveFileId: string | undefined;

    const dbPart = await Part.findOne({ id: dbId });
    if (dbPart && dbPart.driveFileId) {
      driveFileId = dbPart.driveFileId;
    }

    if (!driveFileId) {
      const uploaded = await syncPartThumbnailToDrive(req, req.params, req.params.size);
      if (uploaded) driveFileId = uploaded.id;
    }

    if (driveFileId) {
      const fileBuffer = await driveService.getFileContent(driveFileId).catch(() => null);
      if (fileBuffer) {
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.status(200).send(fileBuffer);
      }
    }

    const directThumbnail = await onshapeService.getPartThumbnail(req.params, req.params.size, userKeys);
    if (!directThumbnail) {
      return res.status(404).json({ message: "Part thumbnail not found" });
    }

    const safeBuffer = ensureBuffer(directThumbnail);
    if (!safeBuffer) {
      return res.status(400).json({ message: "Invalid buffer from Onshape" });
    }

    res.setHeader("Content-Type", "image/png");
    return res.status(200).send(safeBuffer);
  } catch (err: any) {
    return handleOnshapeError(res, err, "Failed to fetch thumbnail for part");
  }
}

export async function setPartThumbnail(
  req: Request<OnshapePartParams, unknown, Buffer>,
  res: Response,
) {
  try {
    const userKeys = await getOnshapeKeysFromRequest(req);
    const buffer = req.body;
    const safeBuffer = ensureBuffer(buffer);
    if (!safeBuffer) return res.status(400).json({ message: `Invalid buffer provided` });

    await onshapeService.setPartThumbnail(req.params, safeBuffer, userKeys);
    return res.sendStatus(204);
  } catch (err) {
    return handleOnshapeError(res, err, "Failed to set thumbnail for part");
  }
}

export async function getElementThumbnail(
  req: Request<OnshapeBomParams & { size?: string }>,
  res: Response,
) {
  try {
    const userKeys = await getOnshapeKeysFromRequest(req);
    const dbIdPrefix = formBomID(req.params);
    let driveFileId: string | undefined;

    const dbBom = await Bom.findOne({ id: { $regex: `^${dbIdPrefix}` }, driveFileId: { $exists: true,$ne: "" } });
    if (dbBom && dbBom.driveFileId) {
      driveFileId = dbBom.driveFileId;
    }

    if (!driveFileId) {
      const uploaded = await syncElementThumbnailToDrive(req, req.params, req.params.size);
      if (uploaded) driveFileId = uploaded.id;
    }

    if (driveFileId) {
      const fileBuffer = await driveService.getFileContent(driveFileId).catch(() => null);
      if (fileBuffer) {
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.status(200).send(fileBuffer);
      }
    }

    const directThumbnail = await onshapeService.getElementThumbnail(req.params, req.params.size, userKeys);
    if (!directThumbnail) {
      return res.status(404).json({ message: "Element thumbnail not found" });
    }

    const safeBuffer = ensureBuffer(directThumbnail);
    if (!safeBuffer) {
      return res.status(400).json({ message: "Invalid image buffer" });
    }

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(200).send(safeBuffer);
  } catch (err: any) {
    return handleOnshapeError(res, err, "Failed to fetch thumbnail for element");
  }
}

export async function setElementThumbnail(
  req: Request<OnshapeBomParams, unknown, Buffer>,
  res: Response,
) {
  try {
    const userKeys = await getOnshapeKeysFromRequest(req);
    const buffer = req.body;
    const safeBuffer = ensureBuffer(buffer);
    if (!safeBuffer) return res.status(400).json({ message: `Invalid buffer provided` });

    await onshapeService.setElementThumbnail(req.params, safeBuffer, userKeys);
    return res.sendStatus(204);
  } catch (err) {
    return handleOnshapeError(res, err, "Failed to set thumbnail for element");
  }
}

export async function exportSTL(
  req: Request<OnshapePartParams>,
  res: Response
) {
  try {
    const userKeys = await getOnshapeKeysFromRequest(req);
    const stl = await onshapeService.exportPartToStl(req.params, userKeys);
    if (!stl) return res.status(404).json({ message: `Part not found ${JSON.stringify(req.params)}` });

    res.setHeader("Content-Type", "model/stl");
    return res.status(200).send(stl);
  } catch (err) {
    return handleOnshapeError(res, err, 'Failed to export stl');
  }
}

export async function exportParasolid(
  req: Request<OnshapePartParams>,
  res: Response
) {
  try {
    const userKeys = await getOnshapeKeysFromRequest(req);
    const parasolid = await onshapeService.exportPartToParasolid(req.params, userKeys);
    if (!parasolid) return res.status(404).json({ message: `Part not found ${JSON.stringify(req.params)}` });

    res.setHeader("Content-Type", "application/x-parasolid");
    return res.status(200).send(parasolid);
  } catch (err) {
    return handleOnshapeError(res, err, 'Failed to export parasolid');
  }
}

export async function exportSolidworks(
  req: Request<OnshapePartParams>,
  res: Response
) {
  try {
    const userKeys = await getOnshapeKeysFromRequest(req);
    const solidworks = await onshapeService.exportPartToSolidworks(req.params, userKeys);
    if (!solidworks) return res.status(404).json({ message: `Part not found ${JSON.stringify(req.params)}` });

    res.setHeader("Content-Type", "application/sldprt");
    return res.status(200).send(solidworks);
  } catch (err) {
    return handleOnshapeError(res, err, 'Failed to export solidworks');
  }
}