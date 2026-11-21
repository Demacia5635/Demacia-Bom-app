import { useEffect, useState } from "react";

// Robust host resolution: Checks hostname for local dev, falls back to explicit Render production URL
const BACKEND_HOST = (typeof window !== "undefined" && window.location.hostname === "localhost")
  ? "http://localhost:5050"
  : (import.meta.env.VITE_CLIENT_URL || "https://demacia-bom-app-n2ag.onrender.com");

/**
 * The full URL of a server route, for code that calls fetch itself (or builds
 * links): `apiUrl("/telemetry/events")` → `<server>/api/telemetry/events`.
 * The path may start with or without "/" or "/api", as with fetchFromApi.
 * The server is localhost:5050 when run locally, else VITE_CLIENT_URL (or the
 * production URL when that isn't set).
 */
export function apiUrl(path: string): string {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  const clean = withSlash === "/api" || withSlash.startsWith("/api/") ? withSlash.slice(4) : withSlash;
  return `${BACKEND_HOST}/api${clean}`;
}

export interface ApiError {
  message: string;
  statusCode?: number;
}

export async function fetchFromApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const secret = import.meta.env.VITE_CLIENT_SECRET;

  if (!secret) {
    throw { message: "VITE_CLIENT_SECRET is missing from environment variables." };
  }

  const cleanEndpoint = endpoint.startsWith("/api") ? endpoint.replace("/api", "") : endpoint;
  const targetUrl = `${BACKEND_HOST}/api${cleanEndpoint.startsWith("/") ? cleanEndpoint : `/${cleanEndpoint}`}`;

  try {
    const response = await fetch(targetUrl, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-client-secret": secret,
        ...options.headers, // Merge custom headers
      },
    });

    // Safely read response as text first to prevent HTML parsing crashes
    const text = await response.text();
    let parsedData: any = null;

    if (text) {
      try {
        parsedData = JSON.parse(text);
      } catch (e) {
        // If it fails to parse and looks like HTML, the API endpoint is missing
        if (text.trim().startsWith("<")) {
          throw {
            message: `Server returned HTML instead of JSON. The endpoint '${endpoint}' might not exist on the backend.`,
            statusCode: response.status || 404,
          } as ApiError;
        }
        throw {
          message: "Failed to parse API response as JSON.",
          statusCode: response.status || 500,
        } as ApiError;
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
 * Downloads a file saved in Google Drive (the STL / Parasolid files saved on
 * publish) and tells the user if it fails, for download buttons.
 */
export async function downloadDriveFile(fileId: string, filename: string): Promise<void> {
  try {
    await downloadFile(`/api/drive/file/id/${encodeURIComponent(fileId)}`, filename);
  } catch (err: any) {
    console.error("Failed to download file:", err);
    alert(`Download failed: ${err?.message || "an unexpected error occurred."}`);
  }
}

/**
 * A file the server sent, as a Blob. The server may send the bytes as they
 * are, or as a serialized Node Buffer ({ type: "Buffer", data: [...] }). Any
 * other content, JSON included (a .json file), is the file itself.
 */
async function fileBlobFromResponse(response: Response, mimeType?: string): Promise<Blob> {
  const arrayBuffer = await response.arrayBuffer();
  const looksLikeJson = new Uint8Array(arrayBuffer, 0, Math.min(1, arrayBuffer.byteLength))[0] === 0x7b; // "{"
  if (looksLikeJson) {
    try {
      const json = JSON.parse(new TextDecoder().decode(arrayBuffer));
      if (json?.type === "Buffer" && Array.isArray(json.data)) {
        return new Blob([new Uint8Array(json.data)], { type: mimeType ?? "application/octet-stream" });
      }
    } catch {
      // Not JSON after all: the bytes are the file.
    }
  }
  const responseContentType = response.headers.get("content-type") ?? "application/octet-stream";
  return new Blob([arrayBuffer], { type: mimeType ?? responseContentType });
}

export async function downloadFile(
  url: string,
  filename: string,
  mimeType?: string
): Promise<void> {
  const secret = import.meta.env.VITE_CLIENT_SECRET;
  if (!secret) {
    throw new Error("VITE_CLIENT_SECRET is missing from environment variables.");
  }

  let targetUrl = url;
  if (url.startsWith("/api")) {
    const cleanEndpoint = url.replace("/api", "");
    targetUrl = `${BACKEND_HOST}/api${cleanEndpoint.startsWith("/") ? cleanEndpoint : `/${cleanEndpoint}`}`;
  } else if (!url.startsWith("http")) {
    targetUrl = `${BACKEND_HOST}${url.startsWith("/") ? url : `/${url}`}`;
  }

  const response = await fetch(targetUrl, {
    headers: {
      "x-client-secret": secret,
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}`);
  }

  const blob = await fileBlobFromResponse(response, mimeType);

  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  // Not straight away: some browsers start the download after click() returns,
  // and would cancel it if the URL were already gone.
  setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
}

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
async function fetchOnshapeImage(url: string, stillWanted: () => boolean): Promise<Response | null> {
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

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

/**
 * Full URL of a saved image (GET /api/drive/file/id/:id, which the server
 * serves without the client secret), or null for anything else.
 */
function publicDriveImageUrl(src: string): string | null {
  if (!src) return null;
  // Absolute (e.g. the Render URL) or relative to our backend.
  if (/^https?:\/\//.test(src)) {
    try {
      return new URL(src).pathname.startsWith("/api/drive/file/id/") ? src : null;
    } catch {
      return null;
    }
  }
  return src.startsWith("/api/drive/file/id/") ? `${BACKEND_HOST}${src}` : null;
}

/** Bytes of a base64 string (atob is native, so this is fast even for large images). */
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Full URL of an image src: paths without a host go to our backend. */
function imageTargetUrl(src: string): string {
  if (src.startsWith("/api")) {
    const cleanEndpoint = src.replace("/api", "");
    return `${BACKEND_HOST}/api${cleanEndpoint.startsWith("/") ? cleanEndpoint : `/${cleanEndpoint}`}`;
  }
  if (!src.startsWith("http")) return `${BACKEND_HOST}${src.startsWith("/") ? src : `/${src}`}`;
  return src;
}

/** Onshape API images use the browser's Onshape session; never send our client secret there. */
const isOnshapeApiUrl = (url: string) => /^https:\/\/[^/]+\.onshape\.com\/api\//.test(url);

/**
 * The image in a response: raw image bytes, a serialized Node Buffer
 * ({ type: "Buffer", data }), or an Onshape render ({ images: [base64Png] }).
 */
async function imageBlobFromResponse(res: Response): Promise<Blob> {
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

/**
 * Loads an image that needs our client secret or the Onshape session, and shows
 * it through an in-memory object URL (URL.createObjectURL). That avoids
 * re-encoding every image as a huge base64 data: string, which was slow and
 * memory-hungry. The object URL is released when the image goes away.
 */
export function AuthenticatedImage({ src, alt, className, ...props }: AuthenticatedImageProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [error, setError] = useState<boolean>(false);

  // Saved images (Google Drive, via our server) are public to read: a plain
  // <img> lets the browser cache them (the server sends Cache-Control) and
  // load only the ones scrolled into view.
  const publicUrl = publicDriveImageUrl(src);

  useEffect(() => {
    setError(false);
    // A new src: don't keep showing the previous image (its object URL is
    // revoked by the cleanup below) while this one loads.
    setImageSrc(null);
    if (!src || publicUrl) return;
    // Inline images need no fetching.
    if (src.startsWith("data:")) {
      setImageSrc(src);
      setError(false);
      return;
    }

    let isMounted = true;
    let objectUrl: string | null = null;
    const secret = import.meta.env.VITE_CLIENT_SECRET;

    const getPicture = async () => {
      try {
        const targetUrl = imageTargetUrl(src);

        // Onshape API images (Chrome extension only) use the browser's Onshape
        // session; never send our client secret to Onshape.
        const isOnshape = isOnshapeApiUrl(targetUrl);

        // An Onshape image stored earlier is reused while its model is unchanged.
        if (isOnshape && onshapeImageCache) {
          const stored = await onshapeImageCache.get(targetUrl);
          if (stored) {
            if (!isMounted) return;
            objectUrl = URL.createObjectURL(stored);
            setImageSrc(objectUrl);
            setError(false);
            return;
          }
        }

        const res = isOnshape
          ? await fetchOnshapeImage(targetUrl, () => isMounted)
          : await fetch(targetUrl, { headers: secret ? { "x-client-secret": secret } : {} });
        if (!res) return; // went away while waiting its turn

        if (!res.ok) throw new Error(`Failed to load image: ${res.statusText}`);

        const blob = await imageBlobFromResponse(res);

        // Storing is only a speed-up: a full or blocked cache mustn't break the image.
        if (isOnshape && onshapeImageCache) onshapeImageCache.put(targetUrl, blob).catch(() => undefined);
        if (!isMounted) return;
        objectUrl = URL.createObjectURL(blob);
        setImageSrc(objectUrl);
        setError(false);
      } catch {
        if (isMounted) setError(true);
      }
    };

    getPicture();

    return () => {
      isMounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, publicUrl]);

  // No saved image for this record (rather than "Loading..." forever).
  if (!src) {
    return <span className="text-zinc-600 text-sm">No image</span>;
  }

  if (publicUrl) {
    return error ? (
      <span className="text-zinc-600 text-sm">Image Load Failed</span>
    ) : (
      <img
        src={publicUrl}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
        onError={() => setError(true)}
        {...props}
      />
    );
  }

  if (error) {
    return <span className="text-zinc-600 text-sm">Image Load Failed</span>;
  }

  if (!imageSrc) {
    return <span className="text-zinc-600 text-sm">Loading...</span>;
  }

  return <img src={imageSrc} alt={alt} className={className} {...props} />;
}

export async function fetchFileBytes(url: string, mimeType?: string): Promise<Blob> {
  const secret = import.meta.env.VITE_CLIENT_SECRET;
  if (!secret) {
    throw new Error("VITE_CLIENT_SECRET is missing from environment variables.");
  }

  let targetUrl = url;
  if (url.startsWith("/api")) {
    const cleanEndpoint = url.replace("/api", "");
    targetUrl = `${BACKEND_HOST}/api${cleanEndpoint.startsWith("/") ? cleanEndpoint : `/${cleanEndpoint}`}`;
  } else if (!url.startsWith("http")) {
    targetUrl = `${BACKEND_HOST}${url.startsWith("/") ? url : `/${url}`}`;
  }

  const response = await fetch(targetUrl, {
    headers: {
      "x-client-secret": secret,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return fileBlobFromResponse(response, mimeType);
}