import { NextFunction, Request, Response } from "express";
import { GoogleDriveService } from "../services/driveService";

export async function checkConnection(
  client: GoogleDriveService,
  req: Request,
  res: Response,
) {
  const connected = await client.checkConnection();
  return res.status(connected.connected ? 200 : 503).json(connected);
}

export async function getFilesFromFolder(
  client: GoogleDriveService,
  req: Request<{ folderID: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const folderID = req.params.folderID;
    if (!folderID)
      return res.status(400).json({ message: "folder id is required" });
    const files = await client.getAllFilesInFolder(folderID);
    if (!files)
      return res.status(404).json({ message: `Folder ${folderID} not found` });
    return res.status(200).json(files);
  } catch (err) {
    next(err);
  }
}

export async function getFileFromId(
  client: GoogleDriveService,
  req: Request<{ fileID: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const fileID = req.params.fileID;
    if (!fileID) {
      return res.status(400).json({ message: "File ID is required" });
    }

    const fileContent = await client.getFileContent(fileID).catch((err: any) => {
      const errorDetails = err?.response?.data || err?.message || err;
      console.error(`>>> [DRIVE GET CONTENT ERROR] fileID: ${fileID}:`, errorDetails);

      if (typeof errorDetails === "object" && errorDetails?.error === "unauthorized_client") {
        console.error(">>> [CRITICAL OAUTH MISMATCH] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET does not match the app that created GOOGLE_REFRESH_TOKEN.");
      }
      return null;
    });

    if (!fileContent) {
      return res.status(401).json({ 
        message: `Failed to stream file from Google Drive for ID: ${fileID}. Check GOOGLE_CLIENT_ID and GOOGLE_REFRESH_TOKEN pairing.` 
      });
    }

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(200).send(fileContent);
  } catch (err: any) {
    console.error(">>> [DRIVE CONTROLLER UNCAUGHT ERROR]:", err?.message || err);
    return res.status(500).json({ message: "Failed to stream file from Google Drive", error: err?.message });
  }
}

export async function uploadFile(
  client: GoogleDriveService,
  req: Request<
    { fileName: string; mimeType: string},
    unknown,
    Buffer
  >,
  res: Response,
  next: NextFunction,
) {
  try {
    const buffer = req.body;
    let safeBuffer: Buffer;

    if (Buffer.isBuffer(buffer)) {
      safeBuffer = buffer;
    } else if (
      buffer &&
      typeof buffer === "object" &&
      "data" in buffer &&
      Array.isArray((buffer as any).data)
    ) {
      safeBuffer = Buffer.from((buffer as any).data);
    } else {
      return res.status(400).json({
        message: `Invalid buffer provided for file upload: expected Buffer, got ${typeof buffer}`,
      });
    }

    const file = await client.uploadFile({
      buffer: safeBuffer,
      fileName: req.params.fileName,
      mimeType: req.params.mimeType
    });
    return res.status(201).json(file);
  } catch (err) {
    return next(err);
  }
}

export async function deleteFile(
  client: GoogleDriveService,
  req: Request<{ fileID: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.fileID;
    if (!id) return res.status(400).json({ message: "file id is required" });
    await client.deleteFile(id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}