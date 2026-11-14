import { useEffect, useState } from "react";

// Robust host resolution: Checks hostname for local dev, falls back to explicit Render production URL
const BACKEND_HOST = (typeof window !== "undefined" && window.location.hostname === "localhost")
  ? "http://localhost:5050"
  : (import.meta.env.VITE_CLIENT_URL || "https://demacia-bom-app-n2ag.onrender.com");

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

  const arrayBuffer = await response.arrayBuffer();
  const firstBytes = new Uint8Array(arrayBuffer.slice(0, 16));

  const looksLikeJson = firstBytes.length > 0 && firstBytes[0] === 0x7b;

  let blob: Blob;
  if (looksLikeJson) {
    const text = new TextDecoder().decode(arrayBuffer);
    const json: { type: "Buffer"; data: number[] } = JSON.parse(text);
    const bytes = new Uint8Array(json.data);
    blob = new Blob([bytes], { type: mimeType ?? "application/octet-stream" });
  } else {
    const responseContentType =
      response.headers.get("content-type") ?? "application/octet-stream";
    blob = new Blob([arrayBuffer], { type: mimeType ?? responseContentType });
  }

  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
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

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

/** Bytes of a base64 string (atob is native, so this is fast even for large images). */
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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

  useEffect(() => {
    if (!src) return;
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
        let targetUrl = src;

        if (src.startsWith("/api")) {
          const cleanEndpoint = src.replace("/api", "");
          targetUrl = `${BACKEND_HOST}/api${cleanEndpoint.startsWith("/") ? cleanEndpoint : `/${cleanEndpoint}`}`;
        } else if (!src.startsWith("http")) {
          targetUrl = `${BACKEND_HOST}${src.startsWith("/") ? src : `/${src}`}`;
        }

        // Onshape API images (Chrome extension only) use the browser's Onshape
        // session; never send our client secret to Onshape.
        const isOnshapeApiUrl = /^https:\/\/[^/]+\.onshape\.com\/api\//.test(targetUrl);
        const res = await fetch(
          targetUrl,
          isOnshapeApiUrl
            ? { credentials: "include" }
            : { headers: secret ? { "x-client-secret": secret } : {} }
        );
        if (isOnshapeApiUrl) onshapeImageListener?.(targetUrl, res.ok);

        if (!res.ok) throw new Error(`Failed to load image: ${res.statusText}`);

        const arrayBuffer = await res.arrayBuffer();
        const firstBytes = new Uint8Array(arrayBuffer.slice(0, 16));
        const looksLikeJson = firstBytes.length > 0 && firstBytes[0] === 0x7b;

        let blob: Blob;
        if (looksLikeJson) {
          const json = JSON.parse(new TextDecoder().decode(arrayBuffer));
          if (json.type === "Buffer" && Array.isArray(json.data)) {
            blob = new Blob([new Uint8Array(json.data)], { type: "image/png" });
          } else if (Array.isArray(json.images) && typeof json.images[0] === "string") {
            // Onshape shaded-view render: { images: [base64Png] }
            blob = new Blob([base64ToBytes(json.images[0])], { type: "image/png" });
          } else {
            throw new Error(json.message || "Invalid image format");
          }
        } else {
          const responseContentType = res.headers.get("content-type");
          const mime = responseContentType && responseContentType.includes("image") ? responseContentType : "image/png";
          blob = new Blob([arrayBuffer], { type: mime });
        }

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
  }, [src]);

  // No saved image for this record (rather than "Loading..." forever).
  if (!src) {
    return <span className="text-zinc-600 text-sm">No image</span>;
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

  const arrayBuffer = await response.arrayBuffer();
  const firstBytes = new Uint8Array(arrayBuffer.slice(0, 16));

  const looksLikeJson = firstBytes.length > 0 && firstBytes[0] === 0x7b;

  if (looksLikeJson) {
    const text = new TextDecoder().decode(arrayBuffer);
    const json: { type: "Buffer"; data: number[] } = JSON.parse(text);
    const bytes = new Uint8Array(json.data);
    return new Blob([bytes], { type: mimeType ?? "application/octet-stream" });
  }

  const responseContentType =
    response.headers.get("content-type") ?? "application/octet-stream";
  return new Blob([arrayBuffer], { type: mimeType ?? responseContentType });
}