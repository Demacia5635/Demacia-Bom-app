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

/** "<catalog number> - <kind>", or the name when there's no catalog number. */
export function recordTitle(kind: string, catalogNumber?: string | null, name?: string | null): string | null {
  const label = catalogNumber?.trim() || name?.trim();
  return label ? `${label} - ${kind}` : null;
}
