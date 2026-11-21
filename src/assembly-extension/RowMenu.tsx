import type { SuggestedFix } from "./problemFixes";

/**
 * The panel's right-click menu on a row (styled by table.css's .context-menu,
 * like the website's). Each item closes the menu, then acts.
 */
export default function RowMenu({
  x,
  y,
  problem,
  fix,
  canEdit,
  inDatabase,
  onApplyFix,
  onOpenWebsite,
  onCopyOnshapeLink,
  onClose,
}: {
  x: number;
  y: number;
  /** The clicked cell's work-order problem, if it has one. */
  problem: string | undefined;
  fix: SuggestedFix | null;
  /** False while loading or publishing (no edits then). */
  canEdit: boolean;
  /** The item has a database record (so the website has a page for it). */
  inDatabase: boolean;
  onApplyFix: () => void;
  onOpenWebsite: () => void;
  onCopyOnshapeLink: () => void;
  onClose: () => void;
}) {
  const run = (action: () => void) => () => {
    onClose();
    action();
  };
  return (
    <div
      className="context-menu"
      role="menu"
      // Kept inside the narrow panel.
      style={{ top: Math.min(y, window.innerHeight - 140), left: Math.max(4, Math.min(x, window.innerWidth - 260)) }}
      onClick={(e) => e.stopPropagation()}
    >
      {problem && (
        <button type="button" role="menuitem" disabled={!fix || !canEdit} title={problem} onClick={run(onApplyFix)}>
          💡 {fix ? `Suggested fix: ${fix.label}` : "No suggested fix for this problem"}
        </button>
      )}
      {inDatabase && (
        <button type="button" role="menuitem" onClick={run(onOpenWebsite)}>
          Open on the website ↗
        </button>
      )}
      <button type="button" role="menuitem" onClick={run(onCopyOnshapeLink)}>
        Copy Onshape link
      </button>
    </div>
  );
}
