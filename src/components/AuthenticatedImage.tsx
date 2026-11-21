import { useEffect, useState } from "react";
import {
  fetchOnshapeImage,
  getOnshapeImageCache,
  imageBlobFromResponse,
  imageTargetUrl,
  isOnshapeApiUrl,
  publicDriveImageUrl,
} from "../util/images";

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
        if (isOnshape && imageCache) imageCache.put(targetUrl, blob).catch(() => undefined);
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
