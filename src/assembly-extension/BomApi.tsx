/**
 * BomApi.tsx
 * =============================================================================
 */

import { fetchFileBytes, type ApiError } from "../util/ApiService";
import type { BomModel, PartModel } from "../util/Models";
import type { OnshapeBomTable } from "./OnshapeBom";

const BASE_URL = `${import.meta.env.VITE_CLIENT_URL}/api`;

/**
 * Builds standard headers including the global client secret and the logged-in user's username.
 */
function getBomApiHeaders(contentType = "application/json"): Record<string, string> {
  const secret = import.meta.env.VITE_CLIENT_SECRET;
  const username = localStorage.getItem("username") || "";

  const headers: Record<string, string> = {};
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  if (secret) {
    headers["x-client-secret"] = secret;
  }
  if (username) {
    headers["x-username"] = username; // <--- This allows the backend to find the user's keys!
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

    if (!response.ok) {
      throw {
        message: `Failed request to ${endpoint}: ${response.statusText}`,
        statusCode: response.status,
      } as ApiError;
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : (undefined as unknown)) as T;
  } catch (err: any) {
    if (err.statusCode) throw err;
    throw { message: err.message || "Network error occurred." } as ApiError;
  }
}

/**
 * Custom GET helper to ensure x-username is sent with every query.
 */
async function fetchJsonFromApi<T>(endpoint: string): Promise<T> {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "GET",
      headers: getBomApiHeaders("application/json"),
    });

    if (!response.ok) {
      throw {
        message: `Failed request to ${endpoint}: ${response.statusText}`,
        statusCode: response.status,
      } as ApiError;
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : (undefined as unknown)) as T;
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

export function dbBomByOnshapeKeyEndpoint(key: OnshapeKey, bomID: string): string {
  return `/db/bom${onshapeKeySegment(key)}/b/${bomID}`;
}

export function dbPartByOnshapeKeyEndpoint(key: OnshapeKey, partID: string): string {
  return `/db/part${onshapeKeySegment(key)}/p/${partID}`;
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

export function upsertPartByOnshapeKey(key: OnshapeKey, partID: string, data: Partial<PartModel>): Promise<PartModel> {
  return postToApi<PartModel>(dbPartByOnshapeKeyEndpoint(key, partID), data);
}

export function upsertBomById(id: string, data: Partial<BomModel>): Promise<BomModel> {
  return postToApi<BomModel>(`/db/bom/id/${id}`, data);
}

export function upsertPartById(id: string, data: Partial<PartModel>): Promise<PartModel> {
  return postToApi<PartModel>(`/db/part/id/${id}`, data);
}

/* ---------------------------------------------------------------------- */
/* Live Onshape data (fallback source when not yet in the DB)              */
/* ---------------------------------------------------------------------- */

export async function getOnshapeBom(key: OnshapeKey): Promise<OnshapeBomTable> {
  const response = await fetchJsonFromApi<OnshapeBomTable>(`/onshape/bom${onshapeKeySegment(key)}`);
  return response;
}

export function updateOnshapePartMetadata(
  key: OnshapeKey,
  partID: string,
  data: Record<string, unknown>
): Promise<unknown> {
  return postToApi(`/onshape/part${onshapeKeySegment(key)}/p/${partID}`, data);
}

export function updateOnshapeBomMetadata(
  key: OnshapeKey,
  data: Record<string, unknown>
): Promise<unknown> {
  return postToApi(`/onshape/bom${onshapeKeySegment(key)}`, data);
}

/* ---------------------------------------------------------------------- */
/* Onshape binary files (thumbnail, STL, Parasolid) -> Google Drive        */
/* ---------------------------------------------------------------------- */

export function getOnshapePartThumbnail(key: OnshapeKey, partID: string): Promise<Blob> {
  const url = `${BASE_URL}/onshape/part${onshapeKeySegment(key)}/p/${partID}/thumbnail`;
  return fetchFileBytes(url, "image/png");
}

export function getOnshapePartStl(key: OnshapeKey, partID: string): Promise<Blob> {
  const url = `${BASE_URL}/onshape/part${onshapeKeySegment(key)}/p/${partID}/stl`;
  return fetchFileBytes(url, "model/stl");
}

export function getOnshapePartParasolid(key: OnshapeKey, partID: string): Promise<Blob> {
  const url = `${BASE_URL}/onshape/part${onshapeKeySegment(key)}/p/${partID}/parasolid`;
  return fetchFileBytes(url, "application/x-parasolid");
}

export function getOnshapeBomThumbnail(key: OnshapeKey): Promise<Blob> {
  const url = `${BASE_URL}/onshape/bom${onshapeKeySegment(key)}/thumbnail`;
  return fetchFileBytes(url, "image/png");
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

  return response.json();
}

export async function syncPartFilesToDrive(
  key: OnshapeKey,
  partID: string,
  partName: string
): Promise<{ avatarID: string | null; stlLink: string | null; parasolidLink: string | null }> {
  const safeName = partName.replace(/[\\/:*?"<>|]/g, "_") || partID;

  const [avatarID, stlLink, parasolidLink] = await Promise.all([
    getOnshapePartThumbnail(key, partID)
      .then((blob) => uploadFileToDrive(blob, `${safeName}-thumbnail.png`))
      .then((r) => r.id)
      .catch(() => null),
    getOnshapePartStl(key, partID)
      .then((blob) => uploadFileToDrive(blob, `${safeName}.stl`))
      .then((r) => r.id)
      .catch(() => null),
    getOnshapePartParasolid(key, partID)
      .then((blob) => uploadFileToDrive(blob, `${safeName}.x_t`))
      .then((r) => r.id)
      .catch(() => null),
  ]);

  return { avatarID, stlLink, parasolidLink };
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