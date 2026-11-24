/**
 * A part's revision as shown. The server keeps it: a whole number from 1,
 * raised on every save that changes a made part's data. Standard parts have
 * none ("—"). Records not yet converted may still hold an old manual text
 * ("B"), shown as it is.
 */
export interface RevisionSource {
  revision?: number | string | null;
  isStandardContent?: boolean;
  markedStandard?: boolean;
}

export function revisionLabel(record: RevisionSource | null | undefined): string {
  const rev = record?.revision;
  if (typeof rev === "number" && Number.isFinite(rev)) return String(rev);
  if (typeof rev === "string" && rev.trim()) return rev.trim();
  if (record?.isStandardContent || record?.markedStandard) return "—";
  return "";
}

/** "Rev 3" for a card or a summary line; "" when there's none to show (standard parts too). */
export function revisionTag(record: RevisionSource | null | undefined): string {
  const label = revisionLabel(record);
  return label && label !== "—" ? `Rev ${label}` : "";
}
