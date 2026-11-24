import { useEffect, useState } from "react";

/** Under Tailwind's `sm` (640px): a phone. */
const NARROW_QUERY = "(max-width: 639px)";
/** "Table view" chosen on a phone, remembered in this browser (all record pages). */
const TABLE_VIEW_KEY = "phone-table-view";

function readTableView(): boolean {
  try {
    return localStorage.getItem(TABLE_VIEW_KEY) === "1";
  } catch {
    return false;
  }
}

function isNarrowNow(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(NARROW_QUERY).matches;
}

/**
 * Phones show the BOM / work-order parts as cards (RecordCardList) instead of
 * the wide table, unless "Table view" was picked. Desktop always has the table.
 */
export function usePhoneCards() {
  const [narrow, setNarrow] = useState(isNarrowNow);
  const [tableView, setTableViewState] = useState(readTableView);

  useEffect(() => {
    const query = window.matchMedia?.(NARROW_QUERY);
    if (!query) return;
    const onChange = () => setNarrow(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const setTableView = (value: boolean) => {
    setTableViewState(value);
    try {
      if (value) localStorage.setItem(TABLE_VIEW_KEY, "1");
      else localStorage.removeItem(TABLE_VIEW_KEY);
    } catch {
      // Storage blocked: the choice lasts until the page closes.
    }
  };

  return { narrow, tableView, setTableView, showCards: narrow && !tableView };
}
