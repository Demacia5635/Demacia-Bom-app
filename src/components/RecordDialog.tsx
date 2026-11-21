import { useEffect, useRef, type ReactNode } from "react";

/**
 * A record's details over the page (Part Portal, a sub-assembly's summary),
 * with a "✕ Close" button. Esc or a tap on the dimmed page around it closes it
 * too. On a phone it takes nearly the whole screen and scrolls inside. Shown
 * while rendered; the caller removes it on close.
 */
export default function RecordDialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // Whether the press started on the backdrop: a text selection dragged out of
  // the dialog doesn't close it.
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Something opened on top (an enlarged image, a list): that one closes first.
      const modals = document.querySelectorAll('[aria-modal="true"]');
      if (modals[modals.length - 1] !== dialogRef.current) return;
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4"
      onPointerDown={(e) => { pressedBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (pressedBackdrop.current && e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-4xl max-h-full sm:max-h-[90vh] overflow-y-auto overscroll-contain">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold"
        >
          <span aria-hidden="true">✕</span> Close
        </button>
        {children}
      </div>
    </div>
  );
}
