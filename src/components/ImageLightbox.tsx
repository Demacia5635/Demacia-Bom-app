import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { createPortal } from "react-dom";
import { AuthenticatedImage } from "./AuthenticatedImage";

const MAX_ZOOM = 4;

/**
 * An image shown large over the page (a click on a row's or a header's
 * image). `src` null: nothing is shown; "FAILED": the image couldn't load.
 * `images`: the pictures it belongs to (e.g. the table's rows, in order), for
 * ← / → to step through them. Zoom with the mouse wheel or a pinch (up to 4×)
 * and drag to pan; Esc, a click outside the image or "✕ Close" closes it.
 */
export default function ImageLightbox({ src, onClose, images }: { src: string | null; onClose: () => void; images?: string[] }) {
  if (!src) return null;
  // A fresh viewer for each opening (its own position and zoom).
  return <Viewer key={src} start={src} onClose={onClose} images={images} />;
}

function Viewer({ start, onClose, images }: { start: string; onClose: () => void; images?: string[] }) {
  const list = images && images.length > 1 && images.includes(start) ? images : null;
  const [current, setCurrent] = useState(start);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [pinching, setPinching] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);

  const index = list ? list.indexOf(current) : -1;
  const step = (by: number) => {
    if (!list) return;
    setCurrent(list[(index + by + list.length) % list.length]);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Esc closes; ← / → step through the images (the latest handlers each render).
  const keysRef = useRef({ onClose, step });
  useEffect(() => {
    keysRef.current = { onClose, step };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") keysRef.current.onClose();
      else if (e.key === "ArrowRight") keysRef.current.step(1);
      else if (e.key === "ArrowLeft") keysRef.current.step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setZoomClamped = (z: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    setZoom(next);
    if (next === 1) setPan({ x: 0, y: 0 });
  };

  const onWheel = (e: WheelEvent) => setZoomClamped(zoom * Math.pow(1.0015, -e.deltaY));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      setPinching(true);
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const last = pointers.current.get(e.pointerId);
    if (!last) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      setZoomClamped(pinchStart.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinchStart.current.distance));
    } else if (zoom > 1) {
      setPan((p) => ({ x: p.x + e.clientX - last.x, y: p.y + e.clientY - last.y }));
    }
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) {
      pinchStart.current = null;
      setPinching(false);
    }
  };

  const arrowButton = "absolute top-1/2 -translate-y-1/2 px-3 py-2 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-100 text-lg";
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Enlarged image"
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <div className="absolute -top-10 right-0 flex items-center gap-2">
          {zoom > 1 && (
            <button type="button" onClick={() => setZoomClamped(1)} className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold shadow-md">
              {Math.round(zoom * 100)}% · Reset
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold shadow-md"
          >
            <span aria-hidden="true">✕</span> Close
          </button>
        </div>
        {current === "FAILED" ? (
          <div className="w-96 max-w-full h-96 bg-zinc-900 border border-zinc-700 rounded-xl flex flex-col items-center justify-center text-zinc-400 gap-2 shadow-2xl">
            <span className="text-xl font-bold">Image Failed to Load</span>
            <span className="text-xs font-mono text-zinc-500">NO IMAGE AVAILABLE</span>
          </div>
        ) : (
          <div
            className={`overflow-hidden rounded-xl touch-none select-none ${zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={() => setZoomClamped(zoom > 1 ? 1 : 2)}
          >
            <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: pinching ? "none" : "transform 80ms" }}>
              <AuthenticatedImage
                src={current}
                alt="Enlarged Preview"
                draggable={false}
                className="max-w-full max-h-[85vh] object-contain rounded-xl border border-zinc-700 shadow-2xl"
              />
            </div>
          </div>
        )}
        {list && (
          <>
            <button type="button" aria-label="Previous image" onClick={() => step(-1)} className={`${arrowButton} left-1 sm:-left-14`}>‹</button>
            <button type="button" aria-label="Next image" onClick={() => step(1)} className={`${arrowButton} right-1 sm:-right-14`}>›</button>
            <span className="mt-2 text-xs text-zinc-300 tabular-nums" aria-live="polite">{index + 1} / {list.length}</span>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
