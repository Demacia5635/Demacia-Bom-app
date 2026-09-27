import { Request, Response } from "express";
import { google } from "googleapis";
import Part from "../models/Part";
import onshapeService, {
  OnshapeApiError,
  UnsupportedOnshapeOperationError,
} from "../services/onshapeService";
import { GoogleDriveService } from "../services/driveService";

console.log(">>> [DEBUG] ONSHAPE CONTROLLER - NO DUPLICATES GUARANTEE LOADED <<<");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

if (process.env.GOOGLE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
}

const driveService = new GoogleDriveService(oauth2Client);
const activeUploads = new Map<string, Promise<{ id: string; webViewLink?: string } | null>>();

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

function formID(params: OnshapePartParams): string {
  return `${params.documentID}_${params.wvmType}_${params.wvmID}_${params.elementID}_${params.partID}`;
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
  params: OnshapePartParams,
  size?: string
): Promise<{ id: string; webViewLink?: string } | null> {
  const partID = params.partID;
  const dbId = formID(params);

  // 1. Check MongoDB first
  const existingDoc = await Part.findOne({ id: dbId });
  if (existingDoc && existingDoc.driveFileId) {
    return { id: existingDoc.driveFileId, webViewLink: existingDoc.imageUrl };
  }

  // 2. Concurrency Lock
  if (activeUploads.has(partID)) {
    return activeUploads.get(partID)!;
  }

  const uploadPromise = (async () => {
    try {
      // 3. Drive Recovery Search
      const existingDriveFile = await driveService.findFileByPartID(partID);
      if (existingDriveFile) {
        await Part.findOneAndUpdate(
          { id: dbId },
          { $set: { driveFileId: existingDriveFile.id, imageUrl: existingDriveFile.webViewLink, onshapeID: params } },
          { returnDocument: "after", upsert: true }
        ).catch(() => {});
        return { id: existingDriveFile.id, webViewLink: existingDriveFile.webViewLink };
      }

      // 4. Fetch from Onshape API
      const thumbnail = await onshapeService.getPartThumbnail(params, size);
      if (!thumbnail) return null;

      const safeBuffer = ensureBuffer(thumbnail);
      if (!safeBuffer) return null;

      // 5. Upload to Google Drive
      const fileName = `part_${partID}_${Date.now()}.png`;
      const uploadedFile = await driveService.uploadFile({
        buffer: safeBuffer,
        fileName: fileName,
        mimeType: "image/png",
        partID: partID,
      }).catch((err) => {
        console.error(`>>> [DRIVE UPLOAD ERROR] Part ${partID}:`, err?.message || err);
        return null;
      });

      if (!uploadedFile || !uploadedFile.id) return null;

      // 6. Save to MongoDB
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
      console.error(`>>> [SYNC EXCEPTION] Part ${partID}:`, err?.message || err);
      return null;
    } finally {
      setTimeout(() => activeUploads.delete(partID), 1000);
    }
  })();

  activeUploads.set(partID, uploadPromise);
  return uploadPromise;
}

export async function checkConnection(req: Request, res: Response) {
  const connected = await onshapeService.checkConnection();
  return res.status(connected ? 200 : 503).json({ connected });
}

export async function getPart(req: Request<OnshapePartParams>, res: Response) {
  try {
    const part = await onshapeService.getPartForDb(req.params);

    if (part && !(part as any).driveFileId) {
      syncPartThumbnailToDrive(req.params).catch(() => {});
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
    const part = await onshapeService.updatePart(req.params, req.body);
    return res.status(200).json(part);
  } catch (err) {
    return handleOnshapeError(res, err, "Failed to update part in Onshape");
  }
}

export async function getBom(req: Request<OnshapeBomParams>, res: Response) {
  try {
    const bom = await onshapeService.getBom(req.params);
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
    const assembly = await onshapeService.updateAssembly(req.params, req.body);
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
    const dbId = formID(req.params);
    let driveFileId: string | undefined;

    const dbPart = await Part.findOne({ id: dbId });
    if (dbPart && dbPart.driveFileId) {
      driveFileId = dbPart.driveFileId;
    }

    if (!driveFileId) {
      const uploaded = await syncPartThumbnailToDrive(req.params, req.params.size);
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

    const directThumbnail = await onshapeService.getPartThumbnail(req.params, req.params.size);
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
    const buffer = req.body;
    const safeBuffer = ensureBuffer(buffer);
    if (!safeBuffer) return res.status(400).json({ message: `Invalid buffer provided` });

    await onshapeService.setPartThumbnail(req.params, safeBuffer);
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
    const directThumbnail = await onshapeService.getElementThumbnail(req.params, req.params.size);
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
    const buffer = req.body;
    const safeBuffer = ensureBuffer(buffer);
    if (!safeBuffer) return res.status(400).json({ message: `Invalid buffer provided` });

    await onshapeService.setElementThumbnail(req.params, safeBuffer);
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
    const stl = await onshapeService.exportPartToStl(req.params);
    if (!stl) return res.status(404).json({ message: `Part not found ${JSON.stringify(req.params)}`});

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
    const parasolid = await onshapeService.exportPartToParasolid(req.params);
    if (!parasolid) return res.status(404).json({ message: `Part not found ${JSON.stringify(req.params)}`});

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
    const solidworks = await onshapeService.exportPartToSolidworks(req.params);
    if (!solidworks) return res.status(404).json({ message: `Part not found ${JSON.stringify(req.params)}`});

    res.setHeader("Content-Type", "application/sldprt");
    return res.status(200).send(solidworks);
  } catch (err) {
    return handleOnshapeError(res, err, 'Failed to export solidworks');
  }
}