import { useEffect } from "react";
import { createPortal } from "react-dom";
import { SHORTCUT_HELP } from "./shortcuts";

/** The "?" list of keyboard shortcuts, styled like the Publish dialog. */
export default function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="publish-modal-overlay" onClick={onClose}>
      <div className="publish-modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="publish-modal-header">
          <h2>Keyboard shortcuts</h2>
        </div>
        <table className="w-full text-sm mt-3 mb-4">
          <tbody>
            {SHORTCUT_HELP.map((s) => (
              <tr key={s.keys}>
                <td className="py-1 pr-4 whitespace-nowrap">
                  <kbd className="rounded border border-zinc-600 px-1.5 py-0.5 text-xs">{s.keys}</kbd>
                </td>
                <td className="py-1 text-zinc-400">{s.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="publish-modal-actions">
          <button type="button" className="publish-btn-secondary" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
