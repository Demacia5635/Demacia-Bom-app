import { apiUrl, serverUrl } from "./backendHost";
import { showToast } from "./toast";

// apiUrl lives with BACKEND_HOST; still importable from here (the extension uses it).
export { apiUrl } from "./backendHost";

export interface ApiError {
  message: string;
  statusCode?: number;
  /** The server's error code (e.g. "CONFLICT", "NOT_FOUND"), when it sent one. */
  code?: string;
  /** The server's id for the request, for its logs, when it sent one. */
  requestId?: string;
}

/** The rest of the server's error reply ({ code, message, fields?, requestId }). */
export interface ApiErrorDetails {
  code?: string;
  requestId?: string;
  /** Problems by field name, when the server names them. */
  fields?: Record<string, unknown>;
}

/**
 * What fetchFromApi throws: a real Error (stack trace, `instanceof`) with the
 * ApiError shape callers read (`message`, `statusCode`, and `code` /
 * `requestId` / `fields` when the server's error reply has them).
 */
export class ApiRequestError extends Error implements ApiError {
  statusCode?: number;
  code?: string;
  requestId?: string;
  fields?: Record<string, unknown>;
  constructor(message: string, statusCode?: number, details: ApiErrorDetails = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
    this.code = details.code;
    this.requestId = details.requestId;
    this.fields = details.fields;
  }
}

/** The error reply's code / requestId / fields, keeping only values of the right type. */
function errorDetails(body: unknown): ApiErrorDetails {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const { code, requestId, fields } = body as Record<string, unknown>;
  return {
    code: typeof code === "string" ? code : undefined,
    requestId: typeof requestId === "string" ? requestId : undefined,
    fields: fields && typeof fields === "object" && !Array.isArray(fields) ? (fields as Record<string, unknown>) : undefined,
  };
}

/** Who saves, sent as X-Updated-By on writes (stored as the record's updatedBy). */
let updatedBy: string | null = null;

/**
 * Names who fetchFromApi's writes come from (the server stores it as
 * `updatedBy`): the website calls setUpdatedBy("website") once. Unset, no
 * header is sent; a call's own X-Updated-By header wins.
 */
export function setUpdatedBy(name: string | null): void {
  updatedBy = name;
}

export async function fetchFromApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const secret = import.meta.env.VITE_CLIENT_SECRET;

  if (!secret) {
    throw new ApiRequestError("VITE_CLIENT_SECRET is missing from environment variables.");
  }

  const targetUrl = apiUrl(endpoint);

  try {
    const response = await fetch(targetUrl, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-client-secret": secret,
        // Header values can't carry non-ASCII (Hebrew names): URL-encoded, as the server expects.
        ...(updatedBy && (options.method ?? "GET").toUpperCase() !== "GET" ? { "X-Updated-By": encodeURIComponent(updatedBy) } : {}),
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
        errorDetails(parsedData),
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
    showToast(`Download failed: ${err?.message || "an unexpected error occurred."}`, "error");
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

  const targetUrl = serverUrl(url);

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
