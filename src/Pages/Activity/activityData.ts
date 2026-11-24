/** The activity feed's data (server: GET /api/admin/events, newest first, ~5000 kept). */

export interface ActivityEvent {
  id: string;
  at: string;
  kind: string;
  who?: string;
  record?: { kind: "part" | "bom" | "workOrder"; id: string; name?: string };
  /** One line ready to show, e.g. "Dana saved Plate (rev 3 → 4: material, mass)". */
  message: string;
  details?: Record<string, unknown>;
}

export interface EventsReply {
  events: ActivityEvent[];
  /** Pass as `before` for the next (older) page; null at the end. */
  next: string | null;
}

/** The kinds, in the filter's order, with their labels. */
export const KIND_LABELS: Record<string, string> = {
  "bom.publish": "Publishes",
  "part.create": "New parts",
  "part.revision": "Revisions",
  "part.delete": "Part deletes",
  "workOrder.create": "New work orders",
  "workOrder.save": "Work order edits",
  "workOrder.part": "Work order part edits",
  "workOrder.cncGroup": "CNC merges",
  "drive.organize": "Drive sorts",
  "parts.cleanup": "Cleanups",
  "drive.fileDelete": "Drive file deletes",
  "revisions.init": "Revision start",
  "admin.locked": "Admin lock-outs",
};

/** "just now", "10 min ago", "3 h ago", "2 days ago", then the date. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(t).toLocaleDateString("en-GB", { timeZone: "Asia/Jerusalem" });
}

/** Newer events (a refresh) on top of the ones shown, each once. */
export function mergeNewest(fresh: ActivityEvent[], shown: ActivityEvent[]): ActivityEvent[] {
  const known = new Set(shown.map((e) => e.id));
  return [...fresh.filter((e) => !known.has(e.id)), ...shown];
}

/** Whether an event matches the person picked and the text (message, record name). */
export function matchesEvent(e: ActivityEvent, who: string, text: string): boolean {
  if (who && (e.who || "") !== who) return false;
  const q = text.trim().toLowerCase();
  return !q || [e.message, e.record?.name].some((v) => v?.toLowerCase().includes(q));
}

/** Where an event's record opens on the website. */
export function recordLink(record: ActivityEvent["record"]): string | null {
  if (!record?.id) return null;
  const id = encodeURIComponent(record.id);
  if (record.kind === "bom") return `/bom/${id}`;
  if (record.kind === "workOrder") return `/workOrder/${id}`;
  if (record.kind === "part") return `/partSearch?part=${id}`;
  return null;
}
