import type { SortConfig } from "../Table";

/**
 * A Table's layout as remembered in this browser (QW7/QW8), under
 * "table:<storageKey>": column widths, order, sort and hidden columns.
 * Only tables given a storageKey remember it (the website's BOM and
 * work-order tables, not the extension panel).
 */
export interface TableLayout {
  widths?: Record<string, number>;
  order?: string[];
  sort?: SortConfig | null;
  hidden?: string[];
}

const keyOf = (storageKey: string) => `table:${storageKey}`;

export function readTableLayout(storageKey: string | undefined): TableLayout {
  if (!storageKey) return {};
  try {
    const saved = JSON.parse(localStorage.getItem(keyOf(storageKey)) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

export function writeTableLayout(storageKey: string, layout: TableLayout): void {
  try {
    localStorage.setItem(keyOf(storageKey), JSON.stringify(layout));
  } catch {
    /* storage unavailable (private window): just not remembered */
  }
}

export function clearTableLayout(storageKey: string): void {
  try {
    localStorage.removeItem(keyOf(storageKey));
  } catch {
    /* nothing to clear */
  }
}
