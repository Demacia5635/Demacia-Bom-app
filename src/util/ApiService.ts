import { BACKEND_HOST } from "./backendHost";

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

/**
 * What fetchFromApi throws: a real Error (stack trace, `instanceof`) with the
 * ApiError shape callers read (`message`, `statusCode`).
 */
export class ApiRequestError extends Error implements ApiError {
  statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
  }
}

export async function fetchFromApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const secret = import.meta.env.VITE_CLIENT_SECRET;

  if (!secret) {
    throw new ApiRequestError("VITE_CLIENT_SECRET is missing from environment variables.");
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
      } catch {
        // If it fails to parse and looks like HTML, the API endpoint is missing
        if (text.trim().startsWith("<")) {
          throw new ApiRequestError(
            `Server returned HTML instead of JSON. The endpoint '${endpoint}' might not exist on the backend.`,
            response.status || 404,
          );
        }
        throw new ApiRequestError("Failed to parse API response as JSON.", response.status || 500);
      }
    }

    if (!response.ok) {
      throw new ApiRequestError(
        parsedData?.message || `Failed request to ${endpoint}: ${response.statusText}`,
        response.status,
      );
    }

    return parsedData as T;
  } catch (err: any) {
    // Our own errors, and a cancelled request (AbortController), go out as they are.
    if (err instanceof ApiRequestError || err?.name === "AbortError") throw err;
    throw new ApiRequestError(err?.message || "Network error occurred.");
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

// Image loading lives in images.ts and components/AuthenticatedImage.tsx; these
// stay importable from here for existing callers (the extension panel).
export { fetchImageBlob, setOnshapeImageCache, setOnshapeImageListener, type OnshapeImageCache } from "./images";
