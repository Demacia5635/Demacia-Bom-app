/**
 * Direct Onshape REST access from the Chrome extension's side panel.
 *
 * Uses the user's own Onshape browser session (cookies) instead of API keys
 * going through our server. Verified in the step 0 spike:
 *  - extension pages with host permission for *.onshape.com send the session
 *    cookie with credentials: "include";
 *  - writes need an X-XSRF-TOKEN header copied from the XSRF-TOKEN cookie;
 *  - binary exports redirect to a regional host (e.g. cad-euw1.onshape.com),
 *    which fetch follows fine from the extension origin;
 *  - session calls don't count against the yearly API limit.
 *
 * Behaviour mirrors server/services/onshapeService.ts so callers see the same
 * results as through the old /api/onshape/* proxy.
 */
import type { ApiError } from "../util/ApiService";
import type { OnshapeBomTable } from "../assembly-extension/OnshapeBom";

/** Same shape as BomApi's OnshapeKey (not imported to avoid a circular import). */
export interface OnshapeElementKey {
  documentID: string;
  wvmType: string;
  wvmID: string;
  elementID: string;
}

/**
 * Error thrown for a failed Onshape call. `statusCode` is deliberately left
 * unset for Onshape auth/rate errors: the page treats statusCode 401/403/429
 * as "your Demacia sign-in expired" and redirects to /signin, which would be
 * the wrong fix when it's the Onshape session that's missing.
 */
export interface OnshapeApiError extends ApiError {
  source: "onshape";
  onshapeStatus: number;
}

const JSON_ACCEPT = "application/json;charset=UTF-8; qs=0.09";

let onshapeServer = "https://cad.onshape.com";

/** Point calls at the Onshape server of the active tab (e.g. an enterprise subdomain). */
export function setOnshapeServer(server: string): void {
  onshapeServer = server.replace(/\/+$/, "");
}

export function getOnshapeServer(): string {
  return onshapeServer;
}

/** True when running inside the Chrome extension (vs. the GitHub Pages web app). */
export function isChromeExtension(): boolean {
  return typeof chrome !== "undefined" && !!chrome.runtime?.id && !!chrome.cookies;
}

async function getXsrfToken(): Promise<string> {
  const cookie = await chrome.cookies.get({ url: onshapeServer, name: "XSRF-TOKEN" });
  if (!cookie) {
    throw onshapeError(401, "No Onshape session found. Sign in to Onshape in this browser.");
  }
  return decodeURIComponent(cookie.value);
}

function onshapeError(status: number, detail: string): OnshapeApiError {
  const hint =
    status === 401 || status === 403
      ? " Make sure you are signed in to Onshape in this browser and can access this document."
      : status === 429
        ? " Onshape is rate-limiting requests; try again in a moment."
        : "";
  return {
    source: "onshape",
    onshapeStatus: status,
    // Only pass through statuses the page doesn't treat as a Demacia sign-in problem.
    statusCode: status === 401 || status === 403 || status === 429 ? undefined : status,
    message: `Onshape request failed (${status}): ${detail}.${hint}`,
  };
}

async function readErrorDetail(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      return JSON.parse(text).message || res.statusText || "error";
    } catch {
      return text.slice(0, 200) || res.statusText || "error";
    }
  } catch {
    return res.statusText || "error";
  }
}

/**
 * Low-level request to `${server}/api${path}` with the user's session.
 * POST/DELETE automatically carry the XSRF header.
 */
export async function onshapeFetch(
  path: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: unknown; accept?: string } = {}
): Promise<Response> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = { Accept: init.accept ?? JSON_ACCEPT };
  if (method !== "GET") {
    headers["X-XSRF-TOKEN"] = await getXsrfToken();
  }
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json;charset=UTF-8";
  }

  let res: Response;
  try {
    res = await fetch(`${onshapeServer}/api${path}`, {
      method,
      credentials: "include",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (err) {
    throw {
      source: "onshape",
      onshapeStatus: 0,
      message: `Could not reach Onshape: ${(err as Error)?.message || err}`,
    } satisfies OnshapeApiError;
  }

  if (!res.ok) {
    throw onshapeError(res.status, await readErrorDetail(res));
  }
  return res;
}

export async function onshapeJson<T>(
  path: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {}
): Promise<T> {
  const res = await onshapeFetch(path, init);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function onshapeBlob(path: string, mimeType: string): Promise<Blob> {
  const res = await onshapeFetch(path, { accept: "*/*" });
  const buf = await res.arrayBuffer();
  return new Blob([buf], { type: mimeType });
}

const seg = (k: OnshapeElementKey) => `d/${k.documentID}/${k.wvmType}/${k.wvmID}/e/${k.elementID}`;
const pid = (partID: string) => encodeURIComponent(partID);

/* ---------------------------------------------------------------------- */
/* BOM + metadata                                                          */
/* ---------------------------------------------------------------------- */

/**
 * Multi-level indented BOM. Uses the UNVERSIONED endpoint: its `bomTable`
 * has the `items` shape OnshapeBom.tsx parses (the /api/v9 endpoint returns a
 * different `rows` + `headerIdToValue` shape).
 */
export async function getBom(key: OnshapeElementKey): Promise<OnshapeBomTable> {
  const res = await onshapeJson<{ bomTable: OnshapeBomTable }>(
    `/assemblies/${seg(key)}/bom?multiLevel=true&indented=true`
  );
  return res.bomTable;
}

/** App field name -> Onshape standard part property id (copied from the server). */
export const PART_PROPERTY_ID_MAP: Record<string, string> = {
  name: "57f3fb8efa3416c06701d60d",
  catalogNumber: "57f3fb8efa3416c06701d60f",
  revision: "57f3fb8efa3416c06701d610",
  description: "57f3fb8efa3416c06701d60e",
  engineer: "57f3fb8efa3416c06701d619",
  material: "57f3fb8efa3416c06701d615",
  price: "6617a03ef812b159a51a8786",
  comments: "66154a7f56997c7041994212",
  vendor: "57f3fb8efa3416c06701d612",
};

interface MetadataProperty {
  propertyId: string;
  name?: string;
  value?: unknown;
  editable?: boolean;
}

export function getPartMetadata(key: OnshapeElementKey, partID: string) {
  return onshapeJson<{ properties: MetadataProperty[] }>(`/metadata/${seg(key)}/p/${pid(partID)}`);
}

export function getElementMetadata(key: OnshapeElementKey) {
  return onshapeJson<{ properties: MetadataProperty[] }>(`/metadata/${seg(key)}`);
}

/** Same mapping rules as the server: known fields only, `material` is never written. */
export async function updatePartMetadata(
  key: OnshapeElementKey,
  partID: string,
  data: Record<string, unknown>
): Promise<unknown> {
  const properties = Object.entries(data)
    .filter(([field]) => field !== "material" && PART_PROPERTY_ID_MAP[field])
    .map(([field, value]) => ({ propertyId: PART_PROPERTY_ID_MAP[field], value }));

  if (properties.length === 0) {
    throw new Error(
      `None of the provided fields have a known Onshape propertyId mapping: ${Object.keys(data).join(", ")}.`
    );
  }

  return onshapeJson(`/metadata/${seg(key)}/p/${pid(partID)}`, {
    method: "POST",
    body: { jsonType: "metadata-part", partId: partID, properties },
  });
}

/** Same rule as the server: match each field to a property by name, case-insensitively. */
export async function updateElementMetadata(
  key: OnshapeElementKey,
  data: Record<string, unknown>
): Promise<unknown> {
  const current = await getElementMetadata(key);
  const properties = Object.entries(data)
    .map(([name, value]) => {
      const match = current.properties.find((p) => p.name?.toLowerCase() === name.toLowerCase());
      return match ? { propertyId: match.propertyId, value } : null;
    })
    .filter((p): p is { propertyId: string; value: unknown } => p !== null);

  if (properties.length === 0) {
    throw new Error("None of the provided property names matched this assembly's metadata properties");
  }

  return onshapeJson(`/metadata/${seg(key)}`, { method: "POST", body: { properties } });
}

/* ---------------------------------------------------------------------- */
/* Binary files                                                            */
/* ---------------------------------------------------------------------- */

/**
 * Absolute thumbnail URL for an <img>-style loader (AuthenticatedImage fetches
 * *.onshape.com/api URLs with the browser's Onshape session). Omit partID for
 * an assembly/element thumbnail.
 */
export function thumbnailUrl(key: OnshapeElementKey, partID?: string, size = "300x300"): string {
  const part = partID ? `/p/${pid(partID)}` : "";
  return `${onshapeServer}/api/thumbnails/${seg(key)}${part}/s/${size}`;
}

/**
 * Rendered isometric view of one part in a specific configuration. Used for
 * Standard Content (bolts, nuts...): their configured parts have no stored
 * thumbnail (the thumbnails endpoint returns 404). Responds with JSON
 * `{ images: [base64Png] }`, which AuthenticatedImage understands.
 */
export function shadedViewUrl(key: OnshapeElementKey, partID: string, configuration?: string, px = 120): string {
  const q = new URLSearchParams({
    outputHeight: String(px),
    outputWidth: String(px),
    pixelSize: "0",
    viewMatrix: "isometric",
  });
  if (configuration) q.set("configuration", configuration);
  return `${onshapeServer}/api/v9/parts/${seg(key)}/partid/${pid(partID)}/shadedviews?${q}`;
}

/**
 * Rendered isometric view of an assembly as it is now. Used instead of the
 * stored element thumbnail, which Onshape refreshes on its own schedule and
 * can show an older state of the model. Responds with JSON
 * `{ images: [base64Png] }`, which AuthenticatedImage understands.
 */
export function assemblyShadedViewUrl(key: OnshapeElementKey, px = 120): string {
  const q = new URLSearchParams({
    outputHeight: String(px),
    outputWidth: String(px),
    pixelSize: "0",
    viewMatrix: "isometric",
  });
  return `${onshapeServer}/api/v9/assemblies/${seg(key)}/shadedviews?${q}`;
}

/** PNG of an assembly as it is now (rendered, not the stored thumbnail), for saving to Drive. */
export function getElementThumbnail(key: OnshapeElementKey, px = 300): Promise<Blob> {
  return renderedPng(assemblyShadedViewUrl(key, px), "assembly");
}

/** Fetches a shaded-view URL and returns its first image as a PNG blob. */
async function renderedPng(url: string, what: string): Promise<Blob> {
  const res = await onshapeFetch(url.slice(`${onshapeServer}/api`.length));
  const json = (await res.json()) as { images?: string[] };
  const base64 = json.images?.[0];
  if (!base64) throw onshapeError(404, `Onshape returned no rendered image for this ${what}`);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: "image/png" });
}

/**
 * PNG of just this part, for saving to Drive on publish. A rendered view, not
 * the stored thumbnail: Onshape stores thumbnails per Part Studio, so a part
 * in a multi-part Part Studio would get a picture of the whole studio.
 */
export async function getPartThumbnail(
  key: OnshapeElementKey,
  partID: string,
  configuration?: string,
  px = 300
): Promise<Blob> {
  return renderedPng(shadedViewUrl(key, partID, configuration, px), "part");
}

/** `?configuration=...` (or "") so exports match the configuration used in the assembly. */
function configQuery(configuration: string | undefined, sep: "?" | "&"): string {
  return configuration ? `${sep}configuration=${encodeURIComponent(configuration)}` : "";
}

/** Same defaults as the server: binary STL in meters. */
export function exportPartStl(key: OnshapeElementKey, partID: string, configuration?: string): Promise<Blob> {
  return onshapeBlob(
    `/parts/${seg(key)}/partid/${pid(partID)}/stl?units=meter&mode=binary${configQuery(configuration, "&")}`,
    "model/stl"
  );
}

export function exportPartParasolid(key: OnshapeElementKey, partID: string, configuration?: string): Promise<Blob> {
  return onshapeBlob(
    `/parts/${seg(key)}/partid/${pid(partID)}/parasolid${configQuery(configuration, "?")}`,
    "application/x-parasolid"
  );
}
