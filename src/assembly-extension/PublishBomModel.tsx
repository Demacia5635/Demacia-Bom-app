
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

/** Progress of a running publish, shown in the modal while it saves. */
export interface PublishProgress {
  /** Items finished. */
  done: number;
  total: number;
  /** Items being worked on right now (several run at once), and what each is doing. */
  active: { name: string; step: string }[];
  /** Problems so far (files not saved, edits not written to Onshape, items not saved). */
  failed: number;
}

/** What a publish of the tree on screen will do, shown before it starts. */
export interface PublishPreview {
  /** The assembly plus each sub-assembly and distinct part. */
  items: number;
  /** Items not in the database yet. */
  newItems: number;
  /** Edited cells (written to Onshape and the database). */
  editedCells: number;
  /** Parts that will keep an STL / Parasolid. */
  stl: number;
  parasolid: number;
  /** Of those, files not exported yet (always exported). */
  newFiles: number;
  /** Saved files whose box was unticked: deleted from Drive. */
  filesToDelete: number;
}

/**
 * Something the user should know before publishing (catalog numbers shared
 * in the tree or already used in the database). "combine": Publish will
 * combine items into one part; "warning": published as it is unless fixed
 * first; "note": for information only (no confirmation needed).
 */
export interface PublishCheck {
  kind: "combine" | "warning" | "note";
  text: string;
}

interface PublishBomModalProps {
  /** Shown above the buttons; any "combine" or "warning" needs a tick before Publish. */
  checks?: PublishCheck[];
  /** Still checking the database: shown as a note; Publish isn't held up by it. */
  checking?: boolean;
  progress?: PublishProgress | null;
  /** Summary shown above the buttons until the publish starts. */
  preview?: PublishPreview | null;
  open: boolean;
  /** "update" when the assembly is already in the database. */
  mode?: "publish" | "update";
  /** Read once when the modal mounts; mount it only while open so it picks up fresh values. */
  initialValues?: Partial<PublishBomFormValues>;
  onCancel: () => void;
  onSubmit: (values: PublishBomFormValues) => void;
  submitting?: boolean;
  /** Why the last publish failed; shown above the buttons until the next try. */
  error?: string | null;
  /** Why Publish can't run right now (e.g. a saved copy); shown, and Publish is disabled. */
  blockedReason?: string | null;
}

export default function PublishBomModal({
  open,
  mode = "publish",
  initialValues = {},
  onCancel,
  onSubmit,
  submitting = false,
  progress = null,
  preview = null,
  checks = [],
  checking = false,
  error = null,
  blockedReason = null,
}: PublishBomModalProps) {
  const [name, setName] = useState(initialValues.name ?? "");
  const [description, setDescription] = useState(initialValues.description ?? "");
  const [comments, setComments] = useState(initialValues.comments ?? "");
  const [catalogNumber, setCatalogNumber] = useState(initialValues.catalogNumber ?? "");
  const [defaultEngineer, setDefaultEngineer] = useState(initialValues.defaultEngineer ?? "");
  const [acknowledged, setAcknowledged] = useState(false);
  const isUpdate = mode === "update";

  if (!open) return null;

  const needsAck = checks.some((c) => c.kind !== "note");
  const combines = checks.some((c) => c.kind === "combine");
  const canSubmit =
    !blockedReason && name.trim().length > 0 && catalogNumber.trim().length > 0 && (!needsAck || acknowledged);

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
              placeholder="For new items without one; saved items keep theirs"
              disabled={submitting}
            />
          </label>

          {!submitting && preview && (
            <div className="publish-progress publish-preview" aria-label="What this publish will do">
              <div>
                <strong>{preview.items}</strong> item{preview.items === 1 ? "" : "s"}
                {preview.newItems > 0 && <> ({preview.newItems} new)</>}
                {" · "}
                <strong>{preview.editedCells}</strong> edited cell{preview.editedCells === 1 ? "" : "s"}
              </div>
              <div>
                Files: {preview.stl} STL, {preview.parasolid} Parasolid, plus thumbnails
                {preview.newFiles > 0 && <> - {preview.newFiles} not exported yet</>}
              </div>
              {preview.filesToDelete > 0 && (
                <div className="publish-progress-failed">
                  {preview.filesToDelete} unticked file{preview.filesToDelete === 1 ? "" : "s"} will be deleted from Drive
                </div>
              )}
              <div className="publish-preview-note">Files of models that haven't changed since the last publish are kept, not exported again.</div>
            </div>
          )}

          {!submitting && (checking || checks.length > 0) && (
            <div className="publish-checks" aria-label="Catalog numbers to check before publishing">
              <div className="publish-checks-title">Catalog numbers</div>
              <ul>
                {checks.map((c, i) => (
                  <li key={i} className={`publish-check publish-check-${c.kind}`}>{c.text}</li>
                ))}
                {checking && <li className="publish-check publish-check-note">Checking which catalog numbers are already used in the database...</li>}
              </ul>
              {needsAck && (
                <label className="publish-checks-ack">
                  <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                  {combines ? "Combine these and publish" : "I understand, publish anyway"}
                </label>
              )}
            </div>
          )}

          {submitting && progress && (
            <div className="publish-progress" role="status" aria-live="polite">
              <div className="publish-progress-row">
                <span>
                  {progress.done < progress.total
                    ? `${progress.done} of ${progress.total} done${progress.active.length > 1 ? ` - ${progress.active.length} at once` : ""}`
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
                  style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
                />
              </div>
              {progress.active.map((item, i) => (
                <div key={i} className="publish-progress-step">
                  {item.name}: {item.step}
                </div>
              ))}
            </div>
          )}

          {!submitting && blockedReason && (
            <div className="publish-progress publish-progress-failed" role="alert">
              {blockedReason}
            </div>
          )}

          {!submitting && error && (
            <div className="publish-progress publish-progress-failed" role="alert">
              {error}
            </div>
          )}

          <div className="publish-modal-actions">
            <button type="button" className="publish-btn-secondary" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="publish-btn-primary" disabled={!canSubmit || submitting}>
              {submitting ? "Publishing..." : combines ? "Combine and publish" : "Publish"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
