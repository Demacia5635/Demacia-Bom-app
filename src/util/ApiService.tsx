import { useEffect, useState } from "react";

// Determine host: Use local backend in dev mode, otherwise default to Render production URL
const BACKEND_HOST = import.meta.env.DEV 
  ? "http://localhost:5050" 
  : (import.meta.env.VITE_CLIENT_URL || "https://demacia-bom-app-n2ag.onrender.com");

export interface ApiError {
  message: string;
  statusCode?: number;
}

export async function fetchFromApi<T>(endpoint: string): Promise<T> {
  const secret = import.meta.env.VITE_CLIENT_SECRET;

  if (!secret) {
    throw { message: "VITE_CLIENT_SECRET is missing from environment variables." };
  }

  const cleanEndpoint = endpoint.startsWith("/api") ? endpoint.replace("/api", "") : endpoint;
  const targetUrl = `${BACKEND_HOST}/api${cleanEndpoint.startsWith("/") ? cleanEndpoint : `/${cleanEndpoint}`}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "x-client-secret": secret,
      },
    });

    if (!response.ok) {
      throw {
        message: `Failed request to ${endpoint}: ${response.statusText}`,
        statusCode: response.status,
      } as ApiError;
    }

    return await response.json();
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

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function AuthenticatedImage({ src, alt, className, ...props }: AuthenticatedImageProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const secret = import.meta.env.VITE_CLIENT_SECRET;

    if (!src) return;

    const getPicture = async () => {
      try {
        let targetUrl = src;

        if (src.startsWith("/api")) {
          const cleanEndpoint = src.replace("/api", "");
          targetUrl = `${BACKEND_HOST}/api${cleanEndpoint.startsWith("/") ? cleanEndpoint : `/${cleanEndpoint}`}`;
        } else if (!src.startsWith("http")) {
          targetUrl = `${BACKEND_HOST}${src.startsWith("/") ? src : `/${src}`}`;
        }

        const res = await fetch(targetUrl, {
          headers: secret ? { "x-client-secret": secret } : {},
        });
        
        if (!res.ok) throw new Error(`Failed to load image: ${res.statusText}`);

        const arrayBuffer = await res.arrayBuffer();
        const firstBytes = new Uint8Array(arrayBuffer.slice(0, 16));
        const looksLikeJson = firstBytes.length > 0 && firstBytes[0] === 0x7b;

        let base64String;
        let mime = "image/png";

        if (looksLikeJson) {
          const text = new TextDecoder().decode(arrayBuffer);
          const json = JSON.parse(text);
          if (json.type === "Buffer" && Array.isArray(json.data)) {
            const bytes = new Uint8Array(json.data);
            base64String = bytesToBase64(bytes);
          } else {
            throw new Error(json.message || "Invalid image format");
          }
        } else {
          const responseContentType = res.headers.get("content-type");
          if (responseContentType && responseContentType.includes("image")) {
            mime = responseContentType;
          }
          const bytes = new Uint8Array(arrayBuffer);
          base64String = bytesToBase64(bytes);
        }

        if (isMounted) {
          setImageSrc(`data:${mime};base64,${base64String}`);
          setError(false);
        }
      } catch (err) {
        if (isMounted) setError(true);
      } 
    };

    getPicture();

    return () => {
      isMounted = false;
    };
  }, [src]);

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