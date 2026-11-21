import { createPortal } from "react-dom";
import { AuthenticatedImage } from "./AuthenticatedImage";

/**
 * An image shown large over the page (a click on a row's or a header's
 * image). `src` null: nothing is shown; "FAILED": the image couldn't load.
 * Closes on a click outside the image or on "✕ Close".
 */
export default function ImageLightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  if (!src) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Enlarged image"
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-10 right-0 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold shadow-md"
        >
          <span aria-hidden="true">✕</span> Close
        </button>
        {src === "FAILED" ? (
          <div className="w-96 h-96 bg-zinc-900 border border-zinc-700 rounded-xl flex flex-col items-center justify-center text-zinc-400 gap-2 shadow-2xl">
            <span className="text-xl font-bold">Image Failed to Load</span>
            <span className="text-xs font-mono text-zinc-500">NO IMAGE AVAILABLE</span>
          </div>
        ) : (
          <AuthenticatedImage
            src={src}
            alt="Enlarged Preview"
            className="max-w-full max-h-[85vh] object-contain rounded-xl border border-zinc-700 shadow-2xl"
          />
        )}
      </div>
    </div>,
    document.body
  );
}
