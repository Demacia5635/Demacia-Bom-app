/**
 * Onshape footprint: every operation the Chrome extension did against
 * Onshape (Refresh BOM, Publish BOM, image loads...), by whom, and how many
 * Onshape requests of each kind it made.
 *
 * Route /tele - deliberately not linked from the sidebar or anywhere else.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchFromApi } from "../../util/ApiService";
import { useThemeSync } from "../../util/misc/useThemeSync";

interface TelemetryEvent {
  _id: string;
  at: string;
  user: string;
  action: string;
  assembly: string;
  documentID: string;
  counts: Record<string, number>;
  total: number;
  failed: number;
  durationMs: number;
  ok: boolean;
  error: string;
  version: string;
}

/** Onshape request kinds, in display order. */
const KINDS: { key: string; label: string }[] = [
  { key: "bom", label: "BOM reads" },
  { key: "metadataRead", label: "Property reads" },
  { key: "metadataWrite", label: "Property writes" },
  { key: "render", label: "Images" },
  { key: "stl", label: "STL" },
  { key: "parasolid", label: "Parasolid" },
  { key: "session", label: "Sign-in checks" },
  { key: "modelCheck", label: "Model-change checks" },
  { key: "other", label: "Other" },
];

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: "1", label: "Last 24 hours", days: 1 },
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "all", label: "All time", days: null },
];

const ALL_USERS = "__all__";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

function sumCounts(events: TelemetryEvent[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const e of events) {
    for (const [k, v] of Object.entries(e.counts || {})) totals[k] = (totals[k] ?? 0) + (Number(v) || 0);
  }
  return totals;
}

export default function TelemetryPage() {
  const { isLight } = useThemeSync();
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState("7");
  const [user, setUser] = useState(ALL_USERS);

  // Each load is numbered: only the newest one's reply is shown (an older range
  // answering late can't replace it), and none after the page is left.
  const loadSeqRef = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const days = RANGES.find((r) => r.key === range)?.days ?? null;
      const since = days ? `&since=${encodeURIComponent(new Date(Date.now() - days * 86_400_000).toISOString())}` : "";
      const result = (await fetchFromApi<TelemetryEvent[]>(`/telemetry/events?limit=2000${since}`)) || [];
      if (seq === loadSeqRef.current) {
        setEvents(result);
        // A user with nothing in this range isn't in the list any more: show everyone
        // rather than empty tables.
        setUser((u) => (u === ALL_USERS || result.some((e) => (e.user || "(unknown)") === u) ? u : ALL_USERS));
      }
    } catch (err: any) {
      if (seq === loadSeqRef.current) setError(err?.message || "Failed to load telemetry");
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  // Leaving the page: any reply still on its way is ignored.
  useEffect(() => () => { loadSeqRef.current++; }, []);

  const users = useMemo(() => Array.from(new Set(events.map((e) => e.user || "(unknown)"))).sort(), [events]);
  const shown = useMemo(
    () => (user === ALL_USERS ? events : events.filter((e) => (e.user || "(unknown)") === user)),
    [events, user]
  );
  const totals = useMemo(() => sumCounts(shown), [shown]);
  const totalRequests = Object.values(totals).reduce((a, b) => a + b, 0);
  const perUser = useMemo(() => {
    const byUser = new Map<string, TelemetryEvent[]>();
    for (const e of shown) {
      const key = e.user || "(unknown)";
      byUser.set(key, [...(byUser.get(key) ?? []), e]);
    }
    return Array.from(byUser.entries())
      .map(([name, list]) => ({ name, operations: list.length, counts: sumCounts(list), last: list[0]?.at }))
      .sort((a, b) => Object.values(b.counts).reduce((x, y) => x + y, 0) - Object.values(a.counts).reduce((x, y) => x + y, 0));
  }, [shown]);

  const pageBg = isLight ? "bg-zinc-50 text-zinc-900" : "bg-zinc-950 text-zinc-100";
  const cardBg = isLight ? "bg-white border-zinc-200" : "bg-zinc-900 border-zinc-800";
  const inputBg = isLight ? "bg-white border-zinc-300 text-zinc-900" : "bg-zinc-900 border-zinc-800 text-zinc-100";
  const textMuted = isLight ? "text-zinc-500" : "text-zinc-400";
  const rowBorder = isLight ? "border-zinc-200" : "border-zinc-800";
  const headCell = `px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide ${textMuted}`;
  const cell = "px-3 py-2 text-sm whitespace-nowrap";

  return (
    <div className={`min-h-screen p-6 transition-colors duration-200 ${pageBg}`}>
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Onshape footprint</h1>
            <p className={`text-xs ${textMuted}`}>
              Requests the BOM Chrome extension made to Onshape, by operation and user. The server and this website
              don't call Onshape.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={range} onChange={(e) => setRange(e.target.value)} className={`border rounded-lg px-3 py-2 text-sm ${inputBg}`}>
              {RANGES.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            <select value={user} onChange={(e) => setUser(e.target.value)} className={`border rounded-lg px-3 py-2 text-sm ${inputBg}`}>
              <option value={ALL_USERS}>All users</option>
              {users.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold"
            >
              {loading ? "Loading..." : "Reload"}
            </button>
          </div>
        </div>

        {error && <div className="p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm">{error}</div>}

        {/* Totals per kind of Onshape request */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className={`border rounded-xl p-3 ${cardBg}`}>
            <div className={`text-xs ${textMuted}`}>Onshape requests</div>
            <div className="text-2xl font-bold">{totalRequests.toLocaleString()}</div>
            <div className={`text-xs ${textMuted}`}>{shown.length.toLocaleString()} operations</div>
          </div>
          {KINDS.filter((k) => totals[k.key]).map((k) => (
            <div key={k.key} className={`border rounded-xl p-3 ${cardBg}`}>
              <div className={`text-xs ${textMuted}`}>{k.label}</div>
              <div className="text-2xl font-bold">{(totals[k.key] ?? 0).toLocaleString()}</div>
            </div>
          ))}
        </div>

        {/* Per user */}
        <div className={`border rounded-xl overflow-x-auto ${cardBg}`}>
          <table className="w-full">
            <thead>
              <tr className={`border-b ${rowBorder}`}>
                <th className={headCell}>User</th>
                <th className={headCell}>Operations</th>
                <th className={headCell}>Requests</th>
                {KINDS.map((k) => (
                  <th key={k.key} className={headCell}>{k.label}</th>
                ))}
                <th className={headCell}>Last active</th>
              </tr>
            </thead>
            <tbody>
              {perUser.map((u) => (
                <tr key={u.name} className={`border-b last:border-0 ${rowBorder}`}>
                  <td className={`${cell} font-medium`}>{u.name}</td>
                  <td className={cell}>{u.operations}</td>
                  <td className={cell}>{Object.values(u.counts).reduce((a, b) => a + b, 0)}</td>
                  {KINDS.map((k) => (
                    <td key={k.key} className={`${cell} ${u.counts[k.key] ? "" : textMuted}`}>{u.counts[k.key] ?? 0}</td>
                  ))}
                  <td className={`${cell} ${textMuted}`}>{u.last ? new Date(u.last).toLocaleString() : ""}</td>
                </tr>
              ))}
              {perUser.length === 0 && !loading && (
                <tr>
                  <td colSpan={KINDS.length + 4} className={`${cell} text-center ${textMuted}`}>No activity in this range.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Every operation, newest first */}
        <div className={`border rounded-xl overflow-x-auto ${cardBg}`}>
          <table className="w-full">
            <thead>
              <tr className={`border-b ${rowBorder}`}>
                <th className={headCell}>When</th>
                <th className={headCell}>User</th>
                <th className={headCell}>Operation</th>
                <th className={headCell}>Assembly</th>
                <th className={headCell}>Requests</th>
                {KINDS.map((k) => (
                  <th key={k.key} className={headCell}>{k.label}</th>
                ))}
                <th className={headCell}>Duration</th>
                <th className={headCell}>Result</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e._id} className={`border-b last:border-0 ${rowBorder}`}>
                  <td className={`${cell} ${textMuted}`}>{new Date(e.at).toLocaleString()}</td>
                  <td className={cell}>{e.user || "(unknown)"}</td>
                  <td className={`${cell} font-medium`}>{e.action}</td>
                  <td className={cell} title={e.documentID}>{e.assembly}</td>
                  <td className={cell}>{e.total}</td>
                  {KINDS.map((k) => (
                    <td key={k.key} className={`${cell} ${e.counts?.[k.key] ? "" : textMuted}`}>{e.counts?.[k.key] ?? 0}</td>
                  ))}
                  <td className={`${cell} ${textMuted}`}>{formatDuration(e.durationMs)}</td>
                  <td className={cell} title={e.error}>
                    {e.ok ? (
                      <span className="text-green-500">{e.failed > 0 ? `OK (${e.failed} failed)` : "OK"}</span>
                    ) : (
                      <span className="text-red-500">Failed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={`text-xs ${textMuted}`}>Showing up to 2,000 most recent operations in the selected range.</p>
      </div>
    </div>
  );
}
