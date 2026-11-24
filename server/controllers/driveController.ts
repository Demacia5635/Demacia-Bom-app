import { NextFunction, Request, Response } from "express";
import { GoogleDriveService, folderForUpload } from "../services/driveService";

/** What a Drive file ID looks like; anything else isn't sent to Drive. */
const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,100}$/;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
// Blobs without a type are sent as application/octet-stream.
const CAD_TYPES = (...types: string[]) => [...types, "application/octet-stream"];
/** File types the team uploads: thumbnails, STL and Parasolid. Extension -> allowed MIME types. */
const UPLOAD_TYPES: Record<string, string[]> = {
  png: IMAGE_TYPES,
  jpg: IMAGE_TYPES,
  jpeg: IMAGE_TYPES,
  webp: IMAGE_TYPES,
  stl: CAD_TYPES("model/stl", "application/sla", "application/vnd.ms-pki.stl"),
  x_t: CAD_TYPES("application/x-parasolid"),
  x_b: CAD_TYPES("application/x-parasolid"),
};

/**
 * Runs before the upload body is read: anything but an allowed extension with
 * a MIME type that fits it gets 415, so it's never buffered.
 */
export function checkUploadType(
  req: Request<{ fileName: string; mimeType: string }>,
  res: Response,
  next: NextFunction,
) {
  const extension = /\.([a-z0-9_]+)$/.exec(req.params.fileName.toLowerCase())?.[1] ?? "";
  const mimeType = req.params.mimeType.split(";")[0].trim().toLowerCase();
  if (!UPLOAD_TYPES[extension]?.includes(mimeType)) {
    return res.status(415).json({
      message: "Only PNG, JPEG or WebP images, STL and Parasolid (.x_t, .x_b) files can be uploaded",
    });
  }
  return next();
}

export async function checkConnection(
  client: GoogleDriveService,
  req: Request,
  res: Response,
) {
  const connected = await client.checkConnection();
  return res.status(connected.connected ? 200 : 503).json(connected);
}

export async function getFileFromId(
  client: GoogleDriveService,
  req: Request<{ fileID: string }>,
  res: Response,
  _next: NextFunction,
) {
  try {
    const fileID = req.params.fileID;
    if (!DRIVE_FILE_ID.test(fileID ?? "")) {
      return res.status(400).json({ message: "A valid file ID is required" });
    }

    let file: { data: Buffer; mimeType: string };
    try {
      // This route is public (for <img> tags), so it may only serve files in
      // the team folders - not anything else the Google account can reach.
      if (!(await client.isInTeamFolders(fileID))) {
        return res.status(404).json({ message: `File ${fileID} not found` });
      }
      file = await client.getFileContent(fileID);
    } catch (err: any) {
      const errorDetails = err?.response?.data || err?.message || err;
      console.error(`>>> [DRIVE GET CONTENT ERROR] fileID: ${fileID}:`, errorDetails);

      if (typeof errorDetails === "object" && errorDetails?.error === "unauthorized_client") {
        console.error(">>> [CRITICAL OAUTH MISMATCH] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET does not match the app that created GOOGLE_REFRESH_TOKEN.");
      }

      // Drive answers 404 for unknown IDs and 400 for malformed ones.
      const driveStatus = Number(err?.response?.status ?? err?.code);
      if (driveStatus === 404 || driveStatus === 400) {
        return res.status(404).json({ message: `File ${fileID} not found` });
      }
      // Anything else (bad OAuth credentials, Drive outage) is the server's
      // problem, not the caller's.
      return res.status(502).json({ message: "Failed to stream file from Google Drive" });
    }

    // Images keep their type so <img> tags render them; everything else (STL,
    // Parasolid, or anything unexpected such as HTML/SVG) is sent as a plain
    // download so it can never run as a page on this server's origin.
    const isRasterImage = /^image\/(png|jpeg|gif|webp|bmp)$/i.test(file.mimeType);
    res.setHeader("Content-Type", isRasterImage ? file.mimeType : "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // The browser may keep it for a day; shared caches (proxies, CDNs) may not.
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.status(200).send(file.data);
  } catch (err: any) {
    console.error(">>> [DRIVE CONTROLLER UNCAUGHT ERROR]:", err?.message || err);
    return res.status(500).json({ message: "Failed to stream file from Google Drive" });
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
      mimeType: req.params.mimeType,
      // STL / Parasolid / image folder, by file type.
      folderId: folderForUpload(req.params.fileName, req.params.mimeType),
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
    if (!DRIVE_FILE_ID.test(id ?? "")) return res.status(400).json({ message: "A valid file ID is required" });
    // Only files in the team folders may be deleted through the API.
    if (!(await client.isInTeamFolders(id)))
      return res.status(404).json({ message: `File ${id} not found` });
    await client.deleteFile(id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}