/**
 * Loading record images: saved images (Google Drive through our server),
 * other URLs, data: URLs, and in the Chrome extension Onshape API images (with
 * a concurrency limit, retries and an optional cache). The component that shows
 * them is components/AuthenticatedImage.tsx.
 */
import { serverUrl } from "./backendHost";

/**
 * Called for every Onshape image request AuthenticatedImage makes (the Chrome
 * extension uses it to count its Onshape footprint; the website never loads
 * Onshape images, so it's unset there).
 */
let onshapeImageListener: ((url: string, ok: boolean) => void) | null = null;
export function setOnshapeImageListener(listener: ((url: string, ok: boolean) => void) | null): void {
  onshapeImageListener = listener;
}

/**
 * Optional store for Onshape images (the Chrome extension keeps them until the
 * model changes; the website doesn't use Onshape images).
 */
export interface OnshapeImageCache {
  get(url: string): Promise<Blob | null>;
  put(url: string, blob: Blob): Promise<void>;
}
let onshapeImageCache: OnshapeImageCache | null = null;
/** The cache set by setOnshapeImageCache, if any. */
export function getOnshapeImageCache(): OnshapeImageCache | null {
  return onshapeImageCache;
}
export function setOnshapeImageCache(cache: OnshapeImageCache | null): void {
  onshapeImageCache = cache;
}

/**
 * Onshape image requests at once. A big tree mounts hundreds of rows together;
 * firing all their renders at once makes Onshape answer 429 (rate limited).
 */
const ONSHAPE_IMAGE_CONCURRENCY = 4;
/** Waits before retrying a rate-limited (429) image, when Onshape sends no Retry-After. */
const ONSHAPE_IMAGE_RETRY_MS = [1000, 3000, 8000];
/** Longest one image request may take (the image then shows as failed). */
const ONSHAPE_IMAGE_TIMEOUT_MS = 30000;
let onshapeImagesActive = 0;
const onshapeImageWaiting: (() => void)[] = [];

/**
 * Fetches an Onshape image when a slot is free. `stillWanted` is checked when
 * the turn comes, so images that went away while queued (a collapsed row, a
 * closed assembly) cost nothing. Returns null for those.
 */
export async function fetchOnshapeImage(url: string, stillWanted: () => boolean): Promise<Response | null> {
  if (onshapeImagesActive >= ONSHAPE_IMAGE_CONCURRENCY) {
    await new Promise<void>((resolve) => onshapeImageWaiting.push(resolve));
  } else {
    onshapeImagesActive += 1;
  }
  try {
    for (let attempt = 0; ; attempt++) {
      if (!stillWanted()) return null;
      // A render Onshape never answers must not hold a slot forever.
      const res = await fetch(url, { credentials: "include", signal: AbortSignal.timeout(ONSHAPE_IMAGE_TIMEOUT_MS) });
      onshapeImageListener?.(url, res.ok);
      if (res.status !== 429 || attempt >= ONSHAPE_IMAGE_RETRY_MS.length) return res;
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = retryAfter > 0 ? Math.min(retryAfter * 1000, 30000) : ONSHAPE_IMAGE_RETRY_MS[attempt];
      await new Promise((r) => setTimeout(r, wait)); // keeps its slot: backing off slows everyone
    }
  } finally {
    const next = onshapeImageWaiting.shift();
    if (next) next(); // the slot passes straight to the next image
    else onshapeImagesActive -= 1;
  }
}


/**
 * Full URL of a saved image (GET /api/drive/file/id/:id, which the server
 * serves without the client secret), or null for anything else.
 */
export function publicDriveImageUrl(src: string): string | null {
  if (!src) return null;
  // Absolute (e.g. the Render URL) or relative to our backend.
  if (/^https?:\/\//.test(src)) {
    try {
      return new URL(src).pathname.startsWith("/api/drive/file/id/") ? src : null;
    } catch {
      return null;
    }
  }
  return src.startsWith("/api/drive/file/id/") ? serverUrl(src) : null;
}

/** Bytes of a base64 string (atob is native, so this is fast even for large images). */
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Full URL of an image src: paths without a host go to our backend. */
export function imageTargetUrl(src: string): string {
  return serverUrl(src);
}

/** Onshape API images use the browser's Onshape session; never send our client secret there. */
export const isOnshapeApiUrl = (url: string) => /^https:\/\/[^/]+\.onshape\.com\/api\//.test(url);

/**
 * The image in a response: raw image bytes, a serialized Node Buffer
 * ({ type: "Buffer", data }), or an Onshape render ({ images: [base64Png] }).
 */
export async function imageBlobFromResponse(res: Response): Promise<Blob> {
  const arrayBuffer = await res.arrayBuffer();
  const firstBytes = new Uint8Array(arrayBuffer.slice(0, 16));
  const looksLikeJson = firstBytes.length > 0 && firstBytes[0] === 0x7b;

  if (looksLikeJson) {
    const json = JSON.parse(new TextDecoder().decode(arrayBuffer));
    if (json.type === "Buffer" && Array.isArray(json.data)) {
      return new Blob([new Uint8Array(json.data)], { type: "image/png" });
    }
    if (Array.isArray(json.images) && typeof json.images[0] === "string") {
      return new Blob([base64ToBytes(json.images[0])], { type: "image/png" });
    }
    throw new Error(json.message || "Invalid image format");
  }
  const responseContentType = res.headers.get("content-type");
  const mime = responseContentType && responseContentType.includes("image") ? responseContentType : "image/png";
  return new Blob([arrayBuffer], { type: mime });
}

/**
 * Loads a saved image (a record's image src: Drive through our server, a full
 * URL, or a data: URL) as a Blob, e.g. to put it in an export. Not for
 * Onshape API images, which only the Chrome extension shows.
 */
export async function fetchImageBlob(src: string): Promise<Blob> {
  if (src.startsWith("data:")) return (await fetch(src)).blob();
  const publicUrl = publicDriveImageUrl(src);
  const targetUrl = publicUrl ?? imageTargetUrl(src);
  if (isOnshapeApiUrl(targetUrl)) throw new Error("Onshape images can't be exported from the website");
  const secret = import.meta.env.VITE_CLIENT_SECRET;
  // Saved Drive images are public to read; the secret goes only where it's needed.
  const res = await fetch(targetUrl, { headers: !publicUrl && secret ? { "x-client-secret": secret } : {} });
  if (!res.ok) throw new Error(`Failed to load image: ${res.status} ${res.statusText}`);
  return imageBlobFromResponse(res);
}
