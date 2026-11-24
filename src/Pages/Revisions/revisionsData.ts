import type { ActivityEvent } from "../Activity/activityData";

/** Recent revision bumps (server: GET /api/admin/revisions, newest first). */
export interface RevisionItem {
  /** The part.revision event: details { from, to, fields }. */
  event: ActivityEvent;
  part: { id: string; name?: string; catalogNumber?: string; revisionNow?: number | string };
  /** The work orders that are open NOW and contain the part, with its status there (whatever it is). */
  openWorkOrders: { id: string; name?: string; status?: string; method?: string }[];
}

export interface RevisionsReply {
  items: RevisionItem[];
  next: string | null;
}

/**
 * How urgent a bump is. The user wants NO false negatives: any part in an
 * open work order is flagged, whatever its status there (files attached to
 * it, like G-code or drawings, are out of date). "high" when it's already
 * being made or done (made or bought), "flag" otherwise, "none" when no open
 * work order has it.
 */
export type Severity = "high" | "flag" | "none";

/** Statuses meaning the part is already being made, made, or bought. */
const ALREADY_STARTED = new Set(["In manufacturing", "Finished Manufacturing", "Finished"]);

export function severity(item: RevisionItem): Severity {
  if (item.openWorkOrders.length === 0) return "none";
  return item.openWorkOrders.some((w) => ALREADY_STARTED.has(w.status ?? "")) ? "high" : "flag";
}

/** "rev 3 → 4" from the event's details (or the part's revision now, if the details are missing). */
export function revisionChange(item: RevisionItem): string {
  const d = item.event.details ?? {};
  const from = d.from as number | string | undefined;
  const to = d.to as number | string | undefined;
  if (from != null && to != null) return `rev ${from} → ${to}`;
  if (to != null) return `rev ${to}`;
  return item.part.revisionNow != null ? `rev ${item.part.revisionNow}` : "rev ?";
}

/** The fields the save changed, from the event's details. */
export function changedFields(item: RevisionItem): string[] {
  const f = item.event.details?.fields;
  return Array.isArray(f) ? f.map(String) : [];
}

/** Within the last `days` days (null: any time). */
export function withinDays(iso: string, days: number | null, now: number = Date.now()): boolean {
  if (days === null) return true;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && now - t <= days * 86_400_000;
}
