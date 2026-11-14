
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

interface PublishBomModalProps {
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
          <h2>{isUpdate ? "Update assembly in the database" : "Publish assembly to the database"}</h2>
          <p>
            {isUpdate
              ? "This will save the details below, add every part or sub-assembly that isn't in the database yet, and update which items each assembly contains to match Onshape. Items already saved keep their data and files."
              : "This will save the assembly and every part or sub-assembly beneath it that isn't already in the database."}
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
            <span>{isUpdate ? "Engineer for new items" : "Default engineer"}</span>
            <input
              value={defaultEngineer}
              onChange={(e) => setDefaultEngineer(e.target.value)}
              placeholder={isUpdate ? "Applied to new items without one set" : "Applied to any part without one set"}
              disabled={submitting}
            />
          </label>

          <div className="publish-modal-actions">
            <button type="button" className="publish-btn-secondary" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="publish-btn-primary" disabled={!canSubmit || submitting}>
              {submitting ? (isUpdate ? "Updating..." : "Publishing...") : isUpdate ? "Update" : "Publish"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
