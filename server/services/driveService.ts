import { google, drive_v3 } from "googleapis";
// google-auth-library isn't a declared dependency: take its types from googleapis.
import type { Auth } from "googleapis";
import { Readable } from "stream";
import { google as googleConfig } from "../config";

/** Longest wait for one Drive request; uploads (up to 20 MB) get longer. */
const DRIVE_TIMEOUT_MS = 30_000;
const DRIVE_UPLOAD_TIMEOUT_MS = 120_000;

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
}

/** The team's Drive folders (images, STL, Parasolid) that the API may touch. */
export function isTeamFolder(folderId: string): boolean {
  return !!folderId && [IMAGE_FOLDER_ID, STL_FOLDER_ID, PARASOLID_FOLDER_ID].includes(folderId);
}

/** Most file IDs remembered by isInTeamFolders. */
const TEAM_FILE_CACHE_MAX = 5000;

export class GoogleDriveService {
  private drive: drive_v3.Drive;

  constructor(oauth2Client: Auth.OAuth2Client) {
    // Without a timeout a stuck Drive request would hang the save that waits on it.
    this.drive = google.drive({ version: "v3", auth: oauth2Client, timeout: DRIVE_TIMEOUT_MS });
  }

  /** fileId -> whether it's directly inside one of the team folders. */
  private teamFileCache = new Map<string, boolean>();

  /**
   * Whether a file is directly inside one of the team folders. The API must
   * not read or delete anything else the Google account can reach. Answers
   * are cached (files don't move between folders), so each file costs one
   * metadata request per server start. Unknown/malformed IDs answer false.
   */
  async isInTeamFolders(fileId: string): Promise<boolean> {
    const cached = this.teamFileCache.get(fileId);
    if (cached !== undefined) return cached;

    let inTeam: boolean;
    try {
      const file = await this.getFile(fileId);
      inTeam = (file.parents ?? []).some(isTeamFolder);
    } catch (err: any) {
      const status = Number(err?.response?.status ?? err?.code);
      if (status !== 404 && status !== 400) throw err; // Drive/OAuth failure: don't cache
      inTeam = false;
    }

    if (this.teamFileCache.size >= TEAM_FILE_CACHE_MAX) {
      // Forget the oldest entry (Maps keep insertion order).
      this.teamFileCache.delete(this.teamFileCache.keys().next().value!);
    }
    this.teamFileCache.set(fileId, inTeam);
    return inTeam;
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

    // gaxios 7 returns a fetch Headers object (bracket lookup is always
    // undefined); older versions returned a plain object.
    const headers = res.headers as unknown as Headers | Record<string, unknown> | undefined;
    const header =
      headers && typeof (headers as Headers).get === "function"
        ? (headers as Headers).get("content-type")
        : (headers as Record<string, unknown> | undefined)?.["content-type"];
    return {
      data: Buffer.from(res.data as ArrayBuffer),
      mimeType: typeof header === "string" ? header : "",
    };
  }

  /**
   * Uploads a new file. Every call creates a file: clients replace a file by
   * uploading the new one and then deleting the old one.
   */
  async uploadFile(params: UploadFileParams): Promise<DriveFile> {
    this.assertImageFolderConfigured();
    const { fileName, mimeType, buffer, folderId } = params;

    // Convert input to a clean Node.js Buffer if necessary
    const safeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

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
    }, { timeout: DRIVE_UPLOAD_TIMEOUT_MS });

    return this.mapFile(res.data);
  }

  /**
   * Moves the file to Drive's trash rather than deleting it for good, so a
   * wrong publish can be undone from Drive. Drive empties its trash itself
   * after 30 days.
   */
  async deleteFile(fileId: string): Promise<void> {
    await this.drive.files.update({ fileId, requestBody: { trashed: true } });
    this.teamFileCache.delete(fileId);
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
  oauth2Client: Auth.OAuth2Client,
): GoogleDriveService {
  return new GoogleDriveService(oauth2Client);
}