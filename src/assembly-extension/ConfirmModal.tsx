import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ConfirmModalProps {
  title: string;
  /** Shown under the title; <p> gets the dialog's text style. */
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A yes/no question inside the panel, styled like the Publish BOM dialog.
 * Used instead of window.confirm, which Firefox's sidebar may not show.
 * Escape or a click outside cancels.
 */
export default function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel }: ConfirmModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return createPortal(
    <div className="publish-modal-overlay" onClick={onCancel}>
      <div className="publish-modal" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="publish-modal-header">
          <h2>{title}</h2>
          {message}
        </div>
        <div className="publish-modal-actions">
          <button type="button" className="publish-btn-secondary" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button type="button" className="publish-btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
