import { useThemeClasses } from "../../util/misc/useThemeClasses";

/** "Bulk delete" (top of the page): turns selection mode on. */
export function BulkDeleteButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Pick several (or all shown) to delete at once"
      className="px-4 py-2 rounded-lg border border-red-500/60 text-red-500 hover:bg-red-500/10 disabled:opacity-50 text-xs font-semibold"
    >
      Bulk delete
    </button>
  );
}

/** The bar shown in selection mode: "Delete all shown (N)…", "Delete selected (N)…", Cancel. */
export function BulkDeleteBar({ shownCount, selectedCount, noun, onDeleteAll, onDeleteSelected, onCancel }: {
  shownCount: number;
  selectedCount: number;
  /** e.g. "parts": "Tick the parts to delete, …". */
  noun: string;
  onDeleteAll: () => void;
  onDeleteSelected: () => void;
  onCancel: () => void;
}) {
  const theme = useThemeClasses();
  return (
    <div className={`sticky top-2 z-10 flex flex-wrap items-center gap-2 border rounded-xl p-3 shadow-lg ${theme.cardWithText}`}>
      <span className={`text-sm mr-auto ${theme.textLabel}`}>
        {selectedCount > 0 ? `${selectedCount} selected` : `Tick the ${noun} to delete, or delete all shown.`}
      </span>
      <button
        type="button"
        onClick={onDeleteAll}
        disabled={shownCount === 0}
        className="px-3 py-1.5 rounded-lg border border-red-500/60 text-red-500 hover:bg-red-500/10 disabled:opacity-50 text-xs font-semibold"
      >
        Delete all shown ({shownCount})…
      </button>
      <button
        type="button"
        onClick={onDeleteSelected}
        disabled={selectedCount === 0}
        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold"
      >
        Delete selected ({selectedCount})…
      </button>
      <button type="button" onClick={onCancel} className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${theme.border}`}>
        Cancel
      </button>
    </div>
  );
}
