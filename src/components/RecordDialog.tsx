import type { ReactNode } from "react";

/**
 * A record's details over the page (Part Portal, a sub-assembly's summary),
 * with a "✕ Close" button. Shown while rendered; the caller removes it on close.
 */
export default function RecordDialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold"
        >
          <span aria-hidden="true">✕</span> Close
        </button>
        {children}
      </div>
    </div>
  );
}
