import { useState } from "react";

/**
 * Bulk delete's selection (/orphans, /files): off until "Bulk delete" is
 * pressed; only items the filter shows count (`shownIds`), so nothing hidden
 * is ever deleted.
 */
export function useBulkSelection() {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  return {
    selectMode,
    start: () => setSelectMode(true),
    /** Leaves selection mode, unselecting everything. */
    cancel: () => {
      setSelectMode(false);
      setSelected(new Set());
    },
    isSelected: (id: string) => selected.has(id),
    toggle: (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    /** Unselects everything not in `ids` (a filter changed, items were deleted). */
    keepOnly: (ids: Iterable<string>) => {
      const keep = new Set(ids);
      setSelected((prev) => new Set([...prev].filter((id) => keep.has(id))));
    },
    /** The selected ones among `shown`, in their order. */
    selectedOf: <T,>(shown: T[], idOf: (item: T) => string) => shown.filter((item) => selected.has(idOf(item))),
  };
}
