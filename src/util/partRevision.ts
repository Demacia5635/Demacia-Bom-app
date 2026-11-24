/**
 * A part's revision as shown, following the server's rules
 * (server/controllers/partRevision.ts):
 * - standard parts (Standard Content, marked standard, or with a vendor) have
 *   no revision: "—";
 * - a made part's revision is a whole number from 1, raised on every save
 *   that changes its data; one saved before revisions existed counts as 1,
 *   so an absent revision shows "1";
 * - records not yet converted may still hold an old manual text ("B"),
 *   shown as it is.
 */
export interface RevisionSource {
  revision?: number | string | null;
  isStandardContent?: boolean;
  markedStandard?: boolean;
  vendor?: string | null;
}

/** Standard (bought) for revisions: no revision of its own. */
export function isStandardForRevision(record: RevisionSource | null | undefined): boolean {
  return !!record?.isStandardContent || !!record?.markedStandard || !!record?.vendor?.trim();
}

export function revisionLabel(record: RevisionSource | null | undefined): string {
  if (!record) return "";
  if (isStandardForRevision(record)) return "—";
  const rev = record.revision;
  if (typeof rev === "number" && Number.isFinite(rev)) return String(rev);
  if (typeof rev === "string" && rev.trim()) return rev.trim();
  return "1";
}

/** "Rev 3" for a card or a summary line; "" for standard parts. */
export function revisionTag(record: RevisionSource | null | undefined): string {
  const label = revisionLabel(record);
  return label && label !== "—" ? `Rev ${label}` : "";
}
