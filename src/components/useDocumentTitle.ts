import { useEffect } from "react";

/** The browser tab's title everywhere else (index.html). */
export const DEFAULT_TITLE = "Demacia BOM";

/**
 * Shows `title` in the browser tab while the page is open (nothing changes
 * until it's known), and puts back "Demacia BOM" on leaving. Set only when the
 * title changes, so the PDF export's temporary title (util/exportPartsPdf.ts)
 * isn't overwritten while printing; it restores this one after.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return;
    document.title = title;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title]);
}

/** "<name> - <kind>", or the catalog number when there's no name (null with neither). */
export function recordTitle(kind: string, name?: string | null, catalogNumber?: string | null): string | null {
  const label = name?.trim() || catalogNumber?.trim();
  return label ? `${label} - ${kind}` : null;
}
