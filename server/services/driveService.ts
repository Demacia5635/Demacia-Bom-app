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

const FOLDER_MIME = "application/vnd.google-apps.folder";
/** The organizer's pace: at most one Drive request per this many ms. */
const ORGANIZE_MIN_INTERVAL_MS = 200;
/** Retries of one organizer request on rate limits and server errors. */
const ORGANIZE_RETRIES = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Drive asking us to slow down (429, 403 rate limit) or failing on its side (5xx). */
function isRetryableDriveError(err: any): boolean {
  const status = Number(err?.response?.status ?? err?.code);
  if (status === 429 || status >= 500) return true;
  if (status !== 403) return false;
  const reasons: string[] = (err?.response?.data?.error?.errors ?? err?.errors ?? []).map((e: any) => e?.reason);
  return reasons.some((r) => r === "rateLimitExceeded" || r === "userRateLimitExceeded");
}

/** Most file IDs remembered by isInTeamFolders. */
const TEAM_FILE_CACHE_MAX = 5000;
/** Deepest folder nesting isInTeamFolders follows up to a type folder. */
const MAX_FOLDER_DEPTH = 20;

export class GoogleDriveService {
  private drive: drive_v3.Drive;

  constructor(oauth2Client: Auth.OAuth2Client) {
    // Without a timeout a stuck Drive request would hang the save that waits on it.
    this.drive = google.drive({ version: "v3", auth: oauth2Client, timeout: DRIVE_TIMEOUT_MS });
  }

  /** fileId -> whether it's inside one of the team folders (at any depth). */
  private teamFileCache = new Map<string, boolean>();
  /** folderId -> whether it is, or is inside, one of the team folders. */
  private teamFolderCache = new Map<string, boolean>();

  /** A file's or folder's parent folder IDs; null if Drive doesn't know the ID. */
  private async parentsOf(id: string): Promise<string[] | null> {
    try {
      const res = await this.drive.files.get({ fileId: id, fields: "parents" });
      return res.data.parents ?? [];
    } catch (err: any) {
      const status = Number(err?.response?.status ?? err?.code);
      if (status === 404 || status === 400) return null;
      throw err; // Drive/OAuth failure: the caller mustn't cache an answer.
    }
  }

  /**
   * Whether a folder is one of the three type folders or inside one, at any
   * depth (the files are sorted into assembly folders inside them). Walks the
   * parents upward; every folder's answer is cached, so a new folder costs one
   * request.
   */
  private async isTeamFolderOrInside(folderId: string, depth = 0): Promise<boolean> {
    if (isTeamFolder(folderId)) return true;
    const cached = this.teamFolderCache.get(folderId);
    if (cached !== undefined) return cached;
    if (depth >= MAX_FOLDER_DEPTH) return false;

    const parents = await this.parentsOf(folderId);
    let inside = false;
    for (const parent of parents ?? []) {
      if (await this.isTeamFolderOrInside(parent, depth + 1)) {
        inside = true;
        break;
      }
    }
    if (this.teamFolderCache.size >= TEAM_FILE_CACHE_MAX) {
      this.teamFolderCache.delete(this.teamFolderCache.keys().next().value!);
    }
    this.teamFolderCache.set(folderId, inside);
    return inside;
  }

  /**
   * Whether a file is inside one of the team folders, directly or in a
   * folder under them. The API must not read or delete anything else the
   * Google account can reach. Answers are cached (files only move between
   * folders inside the team folders), so each file costs one metadata request
   * per server start, plus one per folder not seen before. Unknown/malformed
   * IDs answer false.
   */
  async isInTeamFolders(fileId: string): Promise<boolean> {
    const cached = this.teamFileCache.get(fileId);
    if (cached !== undefined) return cached;

    const parents = await this.parentsOf(fileId);
    let inTeam = false;
    for (const parent of parents ?? []) {
      if (await this.isTeamFolderOrInside(parent)) {
        inTeam = true;
        break;
      }
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

  // ---- Sorting files into folders (services/driveOrganizer.ts) ----
  // These run in the background, so they're throttled to stay well under
  // Drive's rate limits and retried when Drive says to slow down.

  private lastOrganizeCall = 0;
  private organizeQueue: Promise<unknown> = Promise.resolve();

  /** Runs one Drive request for the organizer: throttled, retried on rate limits and 5xx. */
  private organizeCall<T>(run: () => Promise<T>): Promise<T> {
    const result = this.organizeQueue.then(async () => {
      for (let attempt = 0; ; attempt++) {
        const wait = this.lastOrganizeCall + ORGANIZE_MIN_INTERVAL_MS - Date.now();
        if (wait > 0) await sleep(wait);
        this.lastOrganizeCall = Date.now();
        try {
          return await run();
        } catch (err) {
          if (attempt >= ORGANIZE_RETRIES || !isRetryableDriveError(err)) throw err;
          await sleep(1000 * 2 ** attempt + Math.random() * 500);
        }
      }
    });
    // The next call waits for this one, whether it worked or not.
    this.organizeQueue = result.catch(() => undefined);
    return result;
  }

  /** Where a file is: its name, parents and whether it's trashed; null if Drive doesn't know it. */
  async fileLocation(fileId: string): Promise<{ name: string; parents: string[]; trashed: boolean; isFolder: boolean } | null> {
    try {
      const res = await this.organizeCall(() =>
        this.drive.files.get({ fileId, fields: "name, parents, trashed, mimeType" }),
      );
      return {
        name: res.data.name ?? "",
        parents: res.data.parents ?? [],
        trashed: !!res.data.trashed,
        isFolder: res.data.mimeType === FOLDER_MIME,
      };
    } catch (err: any) {
      const status = Number(err?.response?.status ?? err?.code);
      if (status === 404 || status === 400) return null;
      throw err;
    }
  }

  /**
   * The folder with this name directly inside `parentId` (the oldest one if
   * there are several). With `create`, makes it when missing; without, answers
   * null (a dry run).
   */
  async findOrCreateFolder(name: string, parentId: string, create: boolean): Promise<string | null> {
    // Drive's query syntax: backslashes and single quotes are escaped with a backslash.
    const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const res = await this.organizeCall(() =>
      this.drive.files.list({
        q: `name = '${escaped}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
        fields: "files(id, createdTime)",
        orderBy: "createdTime",
        pageSize: 10,
      }),
    );
    const existing = res.data.files?.[0]?.id;
    if (existing) return existing;
    if (!create) return null;
    const created = await this.organizeCall(() =>
      this.drive.files.create({
        requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
        fields: "id",
      }),
    );
    // A folder made under a team folder is inside the team folders.
    this.teamFolderCache.set(created.data.id!, true);
    return created.data.id!;
  }

  /** Moves a file into `toFolderId`, out of `fromFolderIds`. Its ID and links don't change. */
  async moveFile(fileId: string, toFolderId: string, fromFolderIds: string[]): Promise<void> {
    await this.organizeCall(() =>
      this.drive.files.update({
        fileId,
        addParents: toFolderId,
        removeParents: fromFolderIds.join(","),
        fields: "id, parents",
      }),
    );
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