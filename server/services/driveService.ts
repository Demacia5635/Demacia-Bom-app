import { google, drive_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "stream";
import { google as googleConfig } from "../config";

const IMAGE_FOLDER_ID = googleConfig.imageFolderId;
const STL_FOLDER_ID = googleConfig.stlFolderId;
const PARASOLID_FOLDER_ID = googleConfig.parasolidFolderId;

for (const [name, value] of [
  ["GOOGLE_DRIVE_IMAGE_FOLDER_ID", IMAGE_FOLDER_ID],
  ["GOOGLE_DRIVE_STL_FOLDER_ID", STL_FOLDER_ID],
  ["GOOGLE_DRIVE_PARASOLID_FOLDER_ID", PARASOLID_FOLDER_ID],
]) {
  if (!value) console.warn(`[googleDriveService] ${name} is not set.`);
}

/**
 * Drive folder for an uploaded file, chosen by its type: STL files go to the
 * STL folder, Parasolid files to the Parasolid folder, everything else
 * (thumbnails) to the image folder.
 */
export function folderForUpload(fileName: string, mimeType: string): string {
  const name = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();
  if (name.endsWith(".stl") || mime.includes("stl")) return STL_FOLDER_ID;
  if (/\.x_[tb]$/.test(name) || mime.includes("parasolid")) return PARASOLID_FOLDER_ID;
  return IMAGE_FOLDER_ID;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  parents?: string[];
}

export interface UploadFileParams {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  folderId?: string;
  partID?: string; // Optional unique key for deduplication locking
}

// Global cross-controller lock map to prevent parallel duplicate uploads
const globalUploadLocks = new Map<string, Promise<DriveFile>>();

export class GoogleDriveService {
  private drive: drive_v3.Drive;

  constructor(oauth2Client: OAuth2Client) {
    this.drive = google.drive({ version: "v3", auth: oauth2Client });
  }

  async getAllFilesInFolder(
    folderId: string = IMAGE_FOLDER_ID,
  ): Promise<DriveFile[]> {
    this.assertImageFolderConfigured();

    const files: DriveFile[] = [];
    let pageToken: string | undefined = undefined;

    do {
      const res: any = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields:
          "nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, parents)",
        pageSize: 100,
        pageToken,
      });

      const items = (res.data.files ?? []) as drive_v3.Schema$File[];
      files.push(...items.map(this.mapFile));
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    return files;
  }

  async findFileByPartID(partID: string, folderId: string = IMAGE_FOLDER_ID): Promise<DriveFile | null> {
    this.assertImageFolderConfigured();
    try {
      const res = await this.drive.files.list({
        q: `'${folderId}' in parents and name contains 'part_${partID}_' and trashed = false`,
        fields: "files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, parents)",
        pageSize: 1,
      });

      const files = res.data.files;
      if (files && files.length > 0) {
        return this.mapFile(files[0]);
      }
      return null;
    } catch (err) {
      console.error(`>>> [DRIVE ERROR] Failed to search for file with partID ${partID}:`, err);
      return null;
    }
  }

  async getFile(fileId: string): Promise<DriveFile> {
    const res = await this.drive.files.get({
      fileId,
      fields:
        "id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, webContentLink",
    });

    return this.mapFile(res.data);
  }

  /** A file's bytes, with the content type Google Drive reports for it. */
  async getFileContent(fileId: string): Promise<{ data: Buffer; mimeType: string }> {
    const res = await this.drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" },
    );

    const header = (res.headers as Record<string, unknown> | undefined)?.["content-type"];
    return {
      data: Buffer.from(res.data as ArrayBuffer),
      mimeType: typeof header === "string" ? header : "",
    };
  }

  /**
   * Upload a file with built-in atomic deduplication locking.
   */
  async uploadFile(params: UploadFileParams): Promise<DriveFile> {
    this.assertImageFolderConfigured();
    const { fileName, mimeType, buffer, folderId, partID } = params;

    // Convert input to a clean Node.js Buffer if necessary
    const safeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    // If a partID is provided, enforce a global mutex lock
    if (partID) {
      if (globalUploadLocks.has(partID)) {
        console.log(`>>> [GLOBAL LOCK] Intercepted duplicate upload attempt for partID: ${partID}. Awaiting active upload...`);
        return globalUploadLocks.get(partID)!;
      }

      const uploadPromise = (async (): Promise<DriveFile> => {
        try {
          // Pre-flight check inside lock
          const existing = await this.findFileByPartID(partID, folderId ?? IMAGE_FOLDER_ID);
          if (existing) {
            console.log(`>>> [GLOBAL LOCK] Found existing file in Drive during lock for partID: ${partID}`);
            return existing;
          }

          console.log(`>>> [DRIVE API CREATE] Creating Google Drive file for partID: ${partID} (${safeBuffer.length} bytes)...`);

          const res = await this.drive.files.create({
            requestBody: {
              name: fileName,
              parents: [folderId ?? IMAGE_FOLDER_ID],
            },
            media: {
              mimeType,
              body: Readable.from(safeBuffer), // Uses readable stream initialized directly from safeBuffer
            },
            fields:
              "id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, parents",
          });

          console.log(`>>> [DRIVE UPLOAD SUCCESS] Successfully created Google Drive file ${res.data.id}`);
          return this.mapFile(res.data);
        } catch (err: any) {
          console.error(`>>> [DRIVE API ERROR] Failed to upload partID ${partID}:`, err?.response?.data || err?.message || err);
          throw err;
        } finally {
          globalUploadLocks.delete(partID);
        }
      })();

      globalUploadLocks.set(partID, uploadPromise);
      return uploadPromise;
    }

    // Default upload if no partID lock key is present
    const res = await this.drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId ?? IMAGE_FOLDER_ID],
      },
      media: {
        mimeType,
        body: Readable.from(safeBuffer),
      },
      fields:
        "id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, parents",
    });

    return this.mapFile(res.data);
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.drive.files.delete({ fileId });
  }

  async deleteFolder(folderId: string): Promise<void> {
    await this.drive.files.delete({ fileId: folderId });
  }

  async createFolder(
    folderName: string,
    parentFolderId: string = IMAGE_FOLDER_ID,
  ): Promise<DriveFile> {
    this.assertImageFolderConfigured();

    const res = await this.drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentFolderId],
      },
      fields:
        "id, name, mimeType, createdTime, modifiedTime, webViewLink, parents",
    });

    return this.mapFile(res.data);
  }

  private assertImageFolderConfigured() {
    if (!IMAGE_FOLDER_ID) {
      throw new Error(
        "GOOGLE_DRIVE_IMAGE_FOLDER_ID is not set. Add it to your environment variables.",
      );
    }
  }

  async checkConnection(): Promise<
    | { connected: true; user: string | undefined }
    | { connected: false; error: string }
  > {
    try {
      const res = await this.drive.about.get({ fields: "user(emailAddress)" });
      return {
        connected: true,
        user: res.data.user?.emailAddress ?? undefined,
      };
    } catch (err: any) {
      return {
        connected: false,
        error: err?.message ?? "Unknown error connecting to Google Drive",
      };
    }
  }

  private mapFile(file: drive_v3.Schema$File): DriveFile {
    return {
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType!,
      size: file.size ?? undefined,
      createdTime: file.createdTime ?? undefined,
      modifiedTime: file.modifiedTime ?? undefined,
      webViewLink: file.webViewLink ?? undefined,
      webContentLink: file.webContentLink ?? undefined,
      parents: file.parents ?? undefined,
    };
  }
}

export function createGoogleDriveService(
  oauth2Client: OAuth2Client,
): GoogleDriveService {
  return new GoogleDriveService(oauth2Client);
}