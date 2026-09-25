import { Request, Response } from "express";
import { google } from "googleapis";
import onshapeService, {
  OnshapeApiError,
  UnsupportedOnshapeOperationError,
} from "../services/onshapeService";
import { GoogleDriveService } from "../services/driveService";

console.log(">>> [DEBUG] ONSHAPE CONTROLLER FILE LOADED <<<");

// Initialize OAuth2 client for Google Drive
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

if (process.env.GOOGLE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
}

// Instantiate the drive service with the oauth client
const driveService = new GoogleDriveService(oauth2Client);

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

async function syncPartThumbnailToDrive(params: OnshapePartParams, size?: string): Promise<{ id: string; webViewLink?: string } | null> {
  try {
    console.log(">>> [DEBUG] syncPartThumbnailToDrive started for part:", params.partID);
    
    const thumbnail = await onshapeService.getPartThumbnail(params, size);
    if (!thumbnail) {
      console.error(">>> [DEBUG ERROR] onshapeService.getPartThumbnail returned empty/null for part:", params.partID);
      return null;
    }
    console.log(">>> [DEBUG] Successfully fetched thumbnail from Onshape. Converting buffer...");

    const safeBuffer = ensureBuffer(thumbnail);
    if (!safeBuffer) {
      console.error(">>> [DEBUG ERROR] ensureBuffer failed to convert thumbnail data for part:", params.partID);
      return null;
    }
    console.log(`>>> [DEBUG] Safe buffer created. Size: ${safeBuffer.length} bytes. Uploading to Google Drive...`);

    const fileName = `part_${params.partID}_${Date.now()}.png`;
    const uploadedFile = await driveService.uploadFile({
      buffer: safeBuffer,
      fileName: fileName,
      mimeType: "image/png",
    });

    if (!uploadedFile || !uploadedFile.id) {
      console.error(">>> [DEBUG ERROR] Google Drive upload returned no file ID!");
      return null;
    }

    console.log(">>> [SUCCESS] Uploaded to Google Drive! File ID:", uploadedFile.id);

    await onshapeService.updatePart(params, { 
      driveFileId: uploadedFile.id,
      imageUrl: uploadedFile.webViewLink 
    });

    return uploadedFile;
  } catch (err: any) {
    console.error(">>> [CRITICAL ERROR] Failed to sync part thumbnail to Drive:", err?.response?.data || err.message || err);
    return null;
  }
}

async function syncElementThumbnailToDrive(params: OnshapeBomParams, size?: string): Promise<{ id: string; webViewLink?: string } | null> {
  try {
    console.log(">>> [DEBUG] syncElementThumbnailToDrive started for element:", params.elementID);
    
    const thumbnail = await onshapeService.getElementThumbnail(params, size);
    if (!thumbnail) {
      console.error(">>> [DEBUG ERROR] onshapeService.getElementThumbnail returned empty/null for element:", params.elementID);
      return null;
    }

    const safeBuffer = ensureBuffer(thumbnail);
    if (!safeBuffer) {
      console.error(">>> [DEBUG ERROR] ensureBuffer failed for element:", params.elementID);
      return null;
    }

    const fileName = `element_${params.elementID}_${Date.now()}.png`;
    const uploadedFile = await driveService.uploadFile({
      buffer: safeBuffer,
      fileName: fileName,
      mimeType: "image/png",
    });

    if (!uploadedFile || !uploadedFile.id) {
      console.error(">>> [DEBUG ERROR] Google Drive upload returned no file ID for element!");
      return null;
    }

    console.log(">>> [SUCCESS] Uploaded BOM element to Drive! File ID:", uploadedFile.id);

    await onshapeService.updateAssembly(params, { 
      driveFileId: uploadedFile.id,
      imageUrl: uploadedFile.webViewLink 
    });

    return uploadedFile;
  } catch (err: any) {
    console.error(">>> [CRITICAL ERROR] Failed to sync element thumbnail to Drive:", err?.response?.data || err.message || err);
    return null;
  }
}

export async function checkConnection(req: Request, res: Response) {
  console.log(">>> [DEBUG] GET /onshape connection check hit");
  const connected = await onshapeService.checkConnection();
  return res.status(connected ? 200 : 503).json({ connected });
}

export async function getPart(req: Request<OnshapePartParams>, res: Response) {
  console.log(">>> [DEBUG] GET part route hit:", req.params);
  try {
    const part = await onshapeService.getPartForDb(req.params);

    if (part && !(part as any).driveFileId) {
      syncPartThumbnailToDrive(req.params).catch(e => 
        console.error("Background Drive sync error for part:", e)
      );
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
  console.log(">>> [DEBUG] POST part route hit:", req.params);
  try {
    const part = await onshapeService.updatePart(req.params, req.body);
    return res.status(200).json(part);
  } catch (err) {
    return handleOnshapeError(res, err, "Failed to update part in Onshape");
  }
}

export async function getBom(req: Request<OnshapeBomParams>, res: Response) {
  console.log(">>> [DEBUG] GET bom route hit:", req.params);
  try {
    const bom = await onshapeService.getBom(req.params);

    if (bom && !(bom as any).driveFileId) {
      syncElementThumbnailToDrive(req.params).catch(e => 
        console.error("Background Drive sync error for BOM element:", e)
      );
    }

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
  console.log(">>> [DEBUG] POST bom route hit:", req.params);
  try {
    const assembly = await onshapeService.updateAssembly(req.params, req.body)
    return res.status(200).json(assembly);
  } catch (err) {
    return handleOnshapeError(res, err, "Failed to update assembly in Onshape");
  }
}

export async function getPartThumbnail(
  req: Request<OnshapePartParams & { size?: string }>,
  res: Response,
) {
  console.log(">>> [DEBUG] GET part thumbnail route hit:", req.params);
  try {
    const existingPart = await onshapeService.getPartForDb(req.params).catch(() => null);
    let driveFileId = (existingPart as any)?.driveFileId;

    if (!driveFileId) {
      console.log(`[SYNC] Fetching part thumbnail from Onshape & sending directly to Drive...`);
      const uploaded = await syncPartThumbnailToDrive(req.params, req.params.size);
      if (uploaded) driveFileId = uploaded.id;
    }

    if (!driveFileId) {
      return res.status(404).json({ message: "part thumbnail not found" });
    }

    console.log(`[SERVE] Serving part thumbnail from Google Drive file ID:`, driveFileId);
    const meta = await driveService.getFile(driveFileId).catch(() => null);
    const fileBuffer = await driveService.getFileContent(driveFileId).catch(() => null);

    if (!meta || !fileBuffer) {
      return res.status(404).json({ message: "Thumbnail file not found in Google Drive" });
    }

    res.setHeader("Content-Type", meta.mimeType || "image/png");
    return res.status(200).send(fileBuffer);
  } catch (err: any) {
    console.error(">>> [DEBUG ERROR] GOOGLE DRIVE PART UPLOAD ERROR:", err.response?.data || err.message || err);
    return handleOnshapeError(res, err, "Failed to fetch thumbnail for part");
  }
}

export async function setPartThumbnail(
  req: Request<OnshapePartParams, unknown, Buffer>,
  res: Response,
) {
  console.log(">>> [DEBUG] POST part thumbnail route hit:", req.params);
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
  console.log(">>> [DEBUG] GET element thumbnail route hit:", req.params);
  try {
    const existingBom = await onshapeService.getBom(req.params).catch(() => null);
    let driveFileId = (existingBom as any)?.driveFileId;

    if (!driveFileId) {
      console.log(`[SYNC] Fetching BOM element thumbnail from Onshape & sending directly to Drive...`);
      const uploaded = await syncElementThumbnailToDrive(req.params, req.params.size);
      if (uploaded) driveFileId = uploaded.id;
    }

    if (!driveFileId) {
      return res.status(404).json({ message: "element thumbnail not found" });
    }

    console.log(`[SERVE] Serving BOM element thumbnail from Google Drive file ID:`, driveFileId);
    const meta = await driveService.getFile(driveFileId).catch(() => null);
    const fileBuffer = await driveService.getFileContent(driveFileId).catch(() => null);

    if (!meta || !fileBuffer) {
      return res.status(404).json({ message: "Thumbnail file not found in Google Drive" });
    }

    res.setHeader("Content-Type", meta.mimeType || "image/png");
    return res.status(200).send(fileBuffer);
  } catch (err: any) {
    console.error(">>> [DEBUG ERROR] GOOGLE DRIVE ELEMENT UPLOAD ERROR:", err.response?.data || err.message || err);
    return handleOnshapeError(
      res,
      err,
      "Failed to fetch thumbnail for element",
    );
  }
}

export async function setElementThumbnail(
  req: Request<OnshapeBomParams, unknown, Buffer>,
  res: Response,
) {
  console.log(">>> [DEBUG] POST element thumbnail route hit:", req.params);
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
  console.log(">>> [DEBUG] GET export STL route hit:", req.params);
  try {
    const stl = await onshapeService.exportPartToStl(req.params);
    if (!stl) return res.status(404).json({ message: `part not found ${JSON.stringify(req.params)}`});

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
  console.log(">>> [DEBUG] GET export parasolid route hit:", req.params);
  try {
    const parasolid = await onshapeService.exportPartToParasolid(req.params);
    if (!parasolid) return res.status(404).json({ message: `part not found ${JSON.stringify(req.params)}`});

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
  console.log(">>> [DEBUG] GET export solidworks route hit:", req.params);
  try {
    const solidworks = await onshapeService.exportPartToSolidworks(req.params);
    if (!solidworks) return res.status(404).json({ message: `part not found ${JSON.stringify(req.params)}`});

    res.setHeader("Content-Type", "application/sldprt");
    return res.status(200).send(solidworks);
  } catch (err) {
    return handleOnshapeError(res, err, 'Failed to export solidworks');
  }
}