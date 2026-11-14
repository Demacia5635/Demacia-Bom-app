
import { useState } from "react";
import { createPortal } from "react-dom";

export interface PublishBomFormValues {
  name: string;
  description: string;
  comments: string;
  catalogNumber: string;
  /** Applied to every part/sub-assembly being published that doesn't already have an engineer set. */
  defaultEngineer: string;
}

/** Progress of a running publish/update, shown in the modal while it saves. */
export interface PublishProgress {
  /** 1-based number of the item being worked on. */
  itemNumber: number;
  total: number;
  /** Name of that item ("" once all items are done). */
  current: string;
  /** What's happening to it, e.g. "Exporting STL and Parasolid". */
  step: string;
  /** Problems so far (files not saved, edits not written to Onshape). */
  failed: number;
}

interface PublishBomModalProps {
  progress?: PublishProgress | null;
  open: boolean;
  /** "update" when the assembly is already in the database. */
  mode?: "publish" | "update";
  /** Read once when the modal mounts; mount it only while open so it picks up fresh values. */
  initialValues?: Partial<PublishBomFormValues>;
  onCancel: () => void;
  onSubmit: (values: PublishBomFormValues) => void;
  submitting?: boolean;
}

export default function PublishBomModal({
  open,
  mode = "publish",
  initialValues = {},
  onCancel,
  onSubmit,
  submitting = false,
  progress = null,
}: PublishBomModalProps) {
  const [name, setName] = useState(initialValues.name ?? "");
  const [description, setDescription] = useState(initialValues.description ?? "");
  const [comments, setComments] = useState(initialValues.comments ?? "");
  const [catalogNumber, setCatalogNumber] = useState(initialValues.catalogNumber ?? "");
  const [defaultEngineer, setDefaultEngineer] = useState(initialValues.defaultEngineer ?? "");
  const isUpdate = mode === "update";

  if (!open) return null;

  const canSubmit = name.trim().length > 0 && catalogNumber.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    onSubmit({ name: name.trim(), description, comments, catalogNumber: catalogNumber.trim(), defaultEngineer });
  };

  return createPortal(
    <div className="publish-modal-overlay" onClick={submitting ? undefined : onCancel}>
      <div className="publish-modal" onClick={(e) => e.stopPropagation()}>
        <div className="publish-modal-header">
          <h2>Publish BOM</h2>
          <p>
            {isUpdate
              ? "Saves the assembly and everything in it as shown, replacing the saved data. Thumbnails, STL and Parasolid files are exported again and the old copies are deleted from Drive. Edited cells are also written to Onshape."
              : "Saves the assembly and everything in it to the database, with thumbnails, STL and Parasolid files. Edited cells are also written to Onshape."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="publish-modal-form">
          <label className="publish-field">
            <span>Name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Assembly name"
              disabled={submitting}
            />
          </label>

          <label className="publish-field">
            <span>Catalog number</span>
            <input
              value={catalogNumber}
              onChange={(e) => setCatalogNumber(e.target.value)}
              placeholder="e.g. 1234-A"
              disabled={submitting}
            />
          </label>

          <label className="publish-field">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this assembly?"
              rows={3}
              disabled={submitting}
            />
          </label>

          <label className="publish-field">
            <span>Comments</span>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Anything worth noting"
              rows={2}
              disabled={submitting}
            />
          </label>

          <label className="publish-field">
            <span>Default engineer</span>
            <input
              value={defaultEngineer}
              onChange={(e) => setDefaultEngineer(e.target.value)}
              placeholder="Applied to any item without one set"
              disabled={submitting}
            />
          </label>

          {submitting && progress && (
            <div className="publish-progress" role="status" aria-live="polite">
              <div className="publish-progress-row">
                <span>
                  {progress.current
                    ? `${progress.itemNumber} of ${progress.total}`
                    : `All ${progress.total} items done`}
                </span>
                {progress.failed > 0 && (
                  <span className="publish-progress-failed">
                    {progress.failed} problem{progress.failed === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <div className="publish-progress-track">
                <div
                  className="publish-progress-bar"
                  style={{
                    width: `${Math.round(
                      ((progress.current ? progress.itemNumber - 1 : progress.total) / Math.max(progress.total, 1)) * 100
                    )}%`,
                  }}
                />
              </div>
              <div className="publish-progress-step">
                {progress.current ? `${progress.current}: ${progress.step}` : progress.step}
              </div>
            </div>
          )}

          <div className="publish-modal-actions">
            <button type="button" className="publish-btn-secondary" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="publish-btn-primary" disabled={!canSubmit || submitting}>
              {submitting ? "Publishing..." : "Publish"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
