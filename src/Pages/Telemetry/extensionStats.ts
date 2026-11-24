/**
 * Extension stats for /tele, worked out from the telemetry events already
 * loaded: versions in use, Publish BOM success and time, most common errors.
 * errorCode / items / problems / browser come from newer extension versions
 * only (absent on older events).
 */

export interface StatsEvent {
  at: string;
  user?: string;
  action: string;
  ok: boolean;
  error?: string;
  durationMs?: number;
  version?: string;
  errorCode?: string;
  items?: number;
  problems?: number;
  browser?: string;
}

export const PUBLISH_ACTION = "Publish BOM";

/** -1 / 0 / 1 for "4.10.0" vs "4.9.2" (numeric parts; anything else compares as 0). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export interface VersionRow {
  version: string;
  browser: string;
  users: string[];
  latest: boolean;
}

/** Each user's version (and browser) from their newest event; newest version first. */
export function versionsInUse(events: StatsEvent[]): VersionRow[] {
  const newest = new Map<string, StatsEvent>();
  for (const e of events) {
    const user = e.user || "(unknown)";
    const seen = newest.get(user);
    if (!seen || e.at > seen.at) newest.set(user, e);
  }
  const groups = new Map<string, VersionRow>();
  for (const [user, e] of newest) {
    const version = e.version || "?";
    const browser = e.browser || "";
    const key = `${version}|${browser}`;
    if (!groups.has(key)) groups.set(key, { version, browser, users: [], latest: false });
    groups.get(key)!.users.push(user);
  }
  const rows = [...groups.values()];
  const known = rows.map((r) => r.version).filter((v) => v !== "?");
  const top = known.reduce<string | null>((best, v) => (best === null || compareVersions(v, best) > 0 ? v : best), null);
  for (const r of rows) {
    r.latest = r.version === top;
    r.users.sort();
  }
  return rows.sort((a, b) => (a.version === "?" ? 1 : b.version === "?" ? -1 : compareVersions(b.version, a.version)) || a.browser.localeCompare(b.browser));
}

export interface PublishStats {
  total: number;
  ok: number;
  /** Share that succeeded, 0–1 (null with none). */
  successRate: number | null;
  /** Average time of successful publishes, ms. */
  avgMs: number | null;
  /** Average time per saved item (publishes that report `items`), ms. */
  msPerItem: number | null;
  /** Successful publishes that reported non-fatal problems. */
  withProblems: number;
}

export function publishStats(events: StatsEvent[]): PublishStats {
  const publishes = events.filter((e) => e.action === PUBLISH_ACTION);
  const ok = publishes.filter((e) => e.ok);
  const timed = ok.filter((e) => typeof e.durationMs === "number");
  const withItems = timed.filter((e) => typeof e.items === "number" && e.items > 0);
  const itemCount = withItems.reduce((n, e) => n + (e.items ?? 0), 0);
  return {
    total: publishes.length,
    ok: ok.length,
    successRate: publishes.length ? ok.length / publishes.length : null,
    avgMs: timed.length ? timed.reduce((s, e) => s + (e.durationMs ?? 0), 0) / timed.length : null,
    msPerItem: itemCount ? withItems.reduce((s, e) => s + (e.durationMs ?? 0), 0) / itemCount : null,
    withProblems: ok.filter((e) => (e.problems ?? 0) > 0).length,
  };
}

export interface ErrorRow {
  /** The errorCode, else the error text (shortened), else "No code (older version)". */
  key: string;
  coded: boolean;
  count: number;
  lastAt: string;
  /** An example message, when the key is a code. */
  example?: string;
  actions: string[];
}

/** Failed operations grouped by error code (or text), most frequent first. */
export function commonErrors(events: StatsEvent[], limit = 10): ErrorRow[] {
  const rows = new Map<string, ErrorRow>();
  for (const e of events) {
    if (e.ok) continue;
    const text = (e.error || "").trim();
    const coded = !!e.errorCode;
    const key = e.errorCode || (text ? (text.length > 90 ? `${text.slice(0, 90)}…` : text) : "No code (older version)");
    let row = rows.get(key);
    if (!row) {
      row = { key, coded, count: 0, lastAt: e.at, actions: [] };
      rows.set(key, row);
    }
    row.count++;
    if (e.at > row.lastAt) row.lastAt = e.at;
    if (coded && text && !row.example) row.example = text;
    if (!row.actions.includes(e.action)) row.actions.push(e.action);
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt)).slice(0, limit);
}
