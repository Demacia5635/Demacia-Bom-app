/** Telemetry totals per day and per user, as the charts on /tele use them. */

/** What the charts need of an event (TelemetryPage's TelemetryEvent). */
export interface ChartEvent {
  at: string;
  user: string;
  counts: Record<string, number>;
  failed: number;
  ok: boolean;
}

export interface DayStats { day: string; events: number; requests: number; failed: number; failedEvents: number; byKind: Record<string, number> }
export interface UserStats { user: string; events: number; requests: number; failed: number }
/** The server's /telemetry/stats reply (server/API.md). */
export interface Stats { days: DayStats[]; users: UserStats[] }

const ISRAEL_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" });

/** The same totals as the server's /telemetry/stats, from the events loaded (older server, or one user picked). */
export function statsFromEvents(events: ChartEvent[]): Stats {
  const days = new Map<string, DayStats>();
  const users = new Map<string, UserStats>();
  for (const e of events) {
    const day = ISRAEL_DAY.format(new Date(e.at));
    const requests = Object.values(e.counts ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);
    const d = days.get(day) ?? { day, events: 0, requests: 0, failed: 0, failedEvents: 0, byKind: {} };
    d.events += 1;
    d.requests += requests;
    d.failed += e.failed || 0;
    if (!e.ok) d.failedEvents += 1;
    for (const [kind, n] of Object.entries(e.counts ?? {})) d.byKind[kind] = (d.byKind[kind] ?? 0) + (Number(n) || 0);
    days.set(day, d);
    const u = users.get(e.user || "") ?? { user: e.user || "", events: 0, requests: 0, failed: 0 };
    u.events += 1;
    u.requests += requests;
    u.failed += e.failed || 0;
    users.set(u.user, u);
  }
  return {
    days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    users: [...users.values()].sort((a, b) => b.requests - a.requests),
  };
}
