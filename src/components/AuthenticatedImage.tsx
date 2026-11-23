import { useEffect, useState } from "react";
import {
  fetchOnshapeImage,
  getOnshapeImageCache,
  imageBlobFromResponse,
  imageTargetUrl,
  isOnshapeApiUrl,
  publicDriveImageUrl,
} from "../util/images";
import { driveFileAttrs, driveFileIdFromSrc } from "../util/driveLinks";

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

/**
 * Loads an image that needs our client secret or the Onshape session, and shows
 * it through an in-memory object URL (URL.createObjectURL). That avoids
 * re-encoding every image as a huge base64 data: string, which was slow and
 * memory-hungry. The object URL is released when the image goes away.
 */
export function AuthenticatedImage({ src, alt, className, ...props }: AuthenticatedImageProps) {
  // Both kept with the src they belong to, so a new src never shows the previous
  // image (its object URL is revoked by the cleanup below) or its failure.
  const [loaded, setLoaded] = useState<{ src: string; url: string } | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const error = failedSrc === src;
  // Inline images need no fetching.
  const isInline = !!src && src.startsWith("data:");
  const imageSrc = isInline ? src : loaded?.src === src ? loaded.url : null;

  // Saved images (Google Drive, via our server) are public to read: a plain
  // <img> lets the browser cache them (the server sends Cache-Control) and
  // load only the ones scrolled into view.
  const publicUrl = publicDriveImageUrl(src);

  useEffect(() => {
    if (!src || publicUrl || src.startsWith("data:")) return;

    let isMounted = true;
    let objectUrl: string | null = null;
    const secret = import.meta.env.VITE_CLIENT_SECRET;

    const getPicture = async () => {
      const imageCache = getOnshapeImageCache();
      try {
        const targetUrl = imageTargetUrl(src);

        // Onshape API images (Chrome extension only) use the browser's Onshape
        // session; never send our client secret to Onshape.
        const isOnshape = isOnshapeApiUrl(targetUrl);

        // An Onshape image stored earlier is reused while its model is unchanged.
        if (isOnshape && imageCache) {
          const stored = await imageCache.get(targetUrl);
          if (stored) {
            if (!isMounted) return;
            objectUrl = URL.createObjectURL(stored);
            setLoaded({ src, url: objectUrl });
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
        if (isOnshape && imageCache) imageCache.put(targetUrl, blob).catch(() => undefined);
        if (!isMounted) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ src, url: objectUrl });
      } catch {
        if (isMounted) setFailedSrc(src);
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
      // Still in Drive, so it can still be opened there.
      <span className="text-zinc-600 text-sm" {...driveFileAttrs(driveFileIdFromSrc(src), "image")}>Image Load Failed</span>
    ) : (
      <img
        src={publicUrl}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
        onError={() => setFailedSrc(src)}
        // Right-click: "Open image in Google Drive" (DriveFileMenu).
        {...driveFileAttrs(driveFileIdFromSrc(src), "image")}
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
