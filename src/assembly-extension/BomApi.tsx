/**
 * BomApi.tsx
 * =============================================================================
 */

import type { ApiError } from "../util/ApiService";
import type { BomModel, PartModel } from "../util/Models";
import type { OnshapeBomTable } from "./OnshapeBom";
import * as onshapeDirect from "../extension/onshapeDirect";

const BASE_URL = `${import.meta.env.VITE_CLIENT_URL}/api`;

/** Standard headers for our server: content type and the client secret. */
function getBomApiHeaders(contentType = "application/json"): Record<string, string> {
  const secret = import.meta.env.VITE_CLIENT_SECRET;
  const headers: Record<string, string> = {};
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  if (secret) {
    headers["x-client-secret"] = secret;
  }
  return headers;
}

export async function postToApi<T>(endpoint: string, body: unknown): Promise<T> {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: getBomApiHeaders("application/json"),
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let parsedData: any = null;

    if (text) {
      try {
        parsedData = JSON.parse(text);
      } catch (e) {
        if (text.trim().startsWith("<")) {
          throw {
            message: `Server returned HTML. Endpoint '${endpoint}' may be missing.`,
            statusCode: response.status || 404,
          } as ApiError;
        }
        throw { message: "Failed to parse API response as JSON.", statusCode: 500 } as ApiError;
      }
    }

    if (!response.ok) {
      throw {
        message: parsedData?.message || `Failed request to ${endpoint}: ${response.statusText}`,
        statusCode: response.status,
      } as ApiError;
    }

    return parsedData as T;
  } catch (err: any) {
    if (err.statusCode) throw err;
    throw { message: err.message || "Network error occurred." } as ApiError;
  }
}

/**
 * GET helper for our server (client secret header).
 */
async function fetchJsonFromApi<T>(endpoint: string): Promise<T> {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "GET",
      headers: getBomApiHeaders("application/json"),
    });

    const text = await response.text();
    let parsedData: any = null;

    if (text) {
      try {
        parsedData = JSON.parse(text);
      } catch (e) {
        if (text.trim().startsWith("<")) {
          throw {
            message: `Server returned HTML. Endpoint '${endpoint}' may be missing.`,
            statusCode: response.status || 404,
          } as ApiError;
        }
        throw { message: "Failed to parse API response as JSON.", statusCode: 500 } as ApiError;
      }
    }

    if (!response.ok) {
      throw {
        message: parsedData?.message || `Failed request to ${endpoint}: ${response.statusText}`,
        statusCode: response.status,
      } as ApiError;
    }

    return parsedData as T;
  } catch (err: any) {
    if (err.statusCode) throw err;
    throw { message: err.message || "Network error occurred." } as ApiError;
  }
}

export interface OnshapeKey {
  documentID: string;
  wvmType: string;
  wvmID: string;
  elementID: string;
}

const onshapeKeySegment = (k: OnshapeKey) =>
  `/d/${k.documentID}/wvmT/${k.wvmType}/wvmI/${k.wvmID}/e/${k.elementID}`;

/* ---------------------------------------------------------------------- */
/* Database, keyed by Onshape identity                                     */
/* ---------------------------------------------------------------------- */

// IDs are URL-encoded: Onshape part IDs can contain "/" (e.g. "J/D"), which
// would otherwise split the path. Express decodes them back in req.params.
export function dbBomByOnshapeKeyEndpoint(key: OnshapeKey, bomID: string): string {
  return `/db/bom${onshapeKeySegment(key)}/b/${encodeURIComponent(bomID)}`;
}

export function dbPartByOnshapeKeyEndpoint(key: OnshapeKey, partID: string): string {
  return `/db/part${onshapeKeySegment(key)}/p/${encodeURIComponent(partID)}`;
}

export function getBomByOnshapeKey(key: OnshapeKey, bomID: string): Promise<BomModel> {
  return fetchJsonFromApi<BomModel>(dbBomByOnshapeKeyEndpoint(key, bomID));
}

export function getPartByOnshapeKey(key: OnshapeKey, partID: string): Promise<PartModel> {
  return fetchJsonFromApi<PartModel>(dbPartByOnshapeKeyEndpoint(key, partID));
}

export function upsertBomByOnshapeKey(key: OnshapeKey, bomID: string, data: Partial<BomModel>): Promise<BomModel> {
  return postToApi<BomModel>(dbBomByOnshapeKeyEndpoint(key, bomID), data);
}

export function upsertBomById(id: string, data: Partial<BomModel>): Promise<BomModel> {
  return postToApi<BomModel>(`/db/bom/id/${encodeURIComponent(id)}`, data);
}

export function upsertPartById(id: string, data: Partial<PartModel>): Promise<PartModel> {
  return postToApi<PartModel>(`/db/part/id/${encodeURIComponent(id)}`, data);
}

/** Most IDs the server accepts in one batch lookup (MAX_BATCH_IDS on the server). */
const BATCH_IDS = 500;

/** The saved records among `ids` (missing ones are simply absent), in batches. */
async function recordsByIds<T>(endpoint: string, ids: string[]): Promise<T[]> {
  const unique = [...new Set(ids)];
  const batches: Promise<T[]>[] = [];
  for (let i = 0; i < unique.length; i += BATCH_IDS) {
    batches.push(postToApi<T[]>(endpoint, { ids: unique.slice(i, i + BATCH_IDS) }));
  }
  return (await Promise.all(batches)).flat();
}

export function getBomsByIds(ids: string[]): Promise<BomModel[]> {
  return recordsByIds<BomModel>("/db/bom/ids", ids);
}

export function getPartsByIds(ids: string[]): Promise<PartModel[]> {
  return recordsByIds<PartModel>("/db/part/ids", ids);
}

/* ---------------------------------------------------------------------- */
/* Onshape, called directly with the user's browser session                */
/* (src/extension/onshapeDirect.ts). The server never calls Onshape.       */
/* ---------------------------------------------------------------------- */

export function getOnshapeBom(key: OnshapeKey): Promise<OnshapeBomTable> {
  return onshapeDirect.getBom(key);
}

export function updateOnshapePartMetadata(
  key: OnshapeKey,
  partID: string,
  data: Record<string, unknown>
): Promise<unknown> {
  return onshapeDirect.updatePartMetadata(key, partID, data);
}

export function updateOnshapeBomMetadata(key: OnshapeKey, data: Record<string, unknown>): Promise<unknown> {
  return onshapeDirect.updateElementMetadata(key, data);
}

export function getOnshapePartThumbnail(key: OnshapeKey, partID: string, configuration?: string): Promise<Blob> {
  return onshapeDirect.getPartThumbnail(key, partID, configuration);
}

export function getOnshapePartStl(key: OnshapeKey, partID: string, configuration?: string): Promise<Blob> {
  return onshapeDirect.exportPartStl(key, partID, configuration);
}

export function getOnshapePartParasolid(key: OnshapeKey, partID: string, configuration?: string): Promise<Blob> {
  return onshapeDirect.exportPartParasolid(key, partID, configuration);
}

/**
 * Image src for a row, shown live from Onshape:
 * - Assemblies: a rendered view of the assembly as it is now. Onshape's
 *   stored element thumbnail can be out of date (e.g. still showing a feature
 *   that was removed).
 * - Parts: a rendered view of just that part (in its configuration). Onshape
 *   stores thumbnails per Part Studio, not per part, so the thumbnail of a
 *   part in a multi-part Part Studio shows the whole studio; Standard Content
 *   parts have no stored thumbnail at all.
 */
export function getOnshapeThumbnailSrc(
  key: OnshapeKey,
  partID?: string,
  source?: { configuration?: string }
): string {
  if (partID) return onshapeDirect.shadedViewUrl(key, partID, source?.configuration);
  return onshapeDirect.assemblyShadedViewUrl(key);
}

export function getOnshapeBomThumbnail(key: OnshapeKey): Promise<Blob> {
  return onshapeDirect.getElementThumbnail(key);
}

export interface DriveUploadResult {
  id: string;
  name?: string;
  mimeType?: string;
  [key: string]: unknown;
}

export async function uploadFileToDrive(blob: Blob, fileName: string): Promise<DriveUploadResult> {
  const encodedName = encodeURIComponent(fileName);
  const encodedMime = encodeURIComponent(blob.type || "application/octet-stream");
  const url = `${BASE_URL}/drive/file/name/${encodedName}/mime/${encodedMime}`;

  const response = await fetch(url, {
    method: "POST",
    headers: getBomApiHeaders(blob.type || "application/octet-stream"),
    body: blob,
  });

  if (!response.ok) {
    throw {
      message: `Drive upload failed for "${fileName}": ${response.statusText}`,
      statusCode: response.status,
    } as ApiError;
  }

  const text = await response.text();
  if (!text) {
    throw {
      message: `Drive upload returned an empty response for "${fileName}"`,
      statusCode: response.status,
    } as ApiError;
  }

  return JSON.parse(text) as DriveUploadResult;
}

export type PartFileKind = "thumbnail" | "stl" | "parasolid";

export interface PartFilesResult {
  /** Drive file IDs; null when not requested or when it failed. */
  avatarID: string | null;
  stlLink: string | null;
  parasolidLink: string | null;
  /** One message per requested file that could not be exported or uploaded. */
  failures: string[];
}

/**
 * Exports a part's files from Onshape and uploads them to Google Drive. The
 * server puts each file in its folder by type (image / STL / Parasolid).
 * `only` limits which files are made (e.g. just the missing ones); by default
 * all three. Failures don't throw: they're listed in `failures`.
 */
/**
 * Deletes a file from Google Drive (used after Publish BOM replaced it).
 * Best-effort: returns false instead of throwing, so a leftover file never
 * fails a publish.
 */
export async function deleteDriveFile(fileId: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/drive/file/id/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      headers: getBomApiHeaders(""),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function syncPartFilesToDrive(
  key: OnshapeKey,
  partID: string,
  partName: string,
  options: { configuration?: string; only?: PartFileKind[] } = {}
): Promise<PartFilesResult> {
  const safeName = partName.replace(/[\\/:*?"<>|]/g, "_") || partID.replace(/[\\/]/g, "_");
  const wanted = new Set<PartFileKind>(options.only ?? ["thumbnail", "stl", "parasolid"]);
  const failures: string[] = [];

  const make = async (kind: PartFileKind, label: string, get: () => Promise<Blob>, fileName: string) => {
    if (!wanted.has(kind)) return null;
    try {
      return (await uploadFileToDrive(await get(), fileName)).id;
    } catch (err: any) {
      failures.push(`${label} of "${partName}": ${err?.message || err}`);
      return null;
    }
  };

  const [avatarID, stlLink, parasolidLink] = await Promise.all([
    make("thumbnail", "Thumbnail", () => getOnshapePartThumbnail(key, partID, options.configuration), `${safeName}-thumbnail.png`),
    make("stl", "STL", () => getOnshapePartStl(key, partID, options.configuration), `${safeName}.stl`),
    make("parasolid", "Parasolid", () => getOnshapePartParasolid(key, partID, options.configuration), `${safeName}.x_t`),
  ]);

  return { avatarID, stlLink, parasolidLink, failures };
}

export async function syncBomThumbnailToDrive(key: OnshapeKey, bomName: string): Promise<string | null> {
  const safeName = bomName.replace(/[\\/:*?"<>|]/g, "_") || key.elementID;
  try {
    const blob = await getOnshapeBomThumbnail(key);
    const result = await uploadFileToDrive(blob, `${safeName}-thumbnail.png`);
    return result.id;
  } catch {
    return null;
  }
}