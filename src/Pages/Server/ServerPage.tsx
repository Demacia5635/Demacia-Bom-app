/**
 * Server status (admin): version and uptime, database and Drive, the last
 * Drive sort / cleanup runs, admin-secret lock-outs and response times per
 * route (server: GET /api/admin/status, admin-only). Jobs and timings are
 * kept in the server's memory, so they start over when it restarts.
 *
 * Route /server - in the sidebar's ADMIN section only.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useThemeClasses } from "../../util/misc/useThemeClasses";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import ErrorBanner from "../../components/ErrorBanner";
import { adminFetch } from "../../util/adminUnlock";
import { formatUptime, jobCounts, maskIp } from "./serverFormat";

interface OrganizeJob {
  id: string;
  dryRun?: boolean;
  trigger?: string;
  status?: string;
  startedAt?: string;
  finishedAt?: string;
  progress?: { done: number; total: number };
  summary?: Record<string, unknown>;
  /** Publish runs: the dropped parts deleted, and those kept because something uses them again. */
  cleanup?: { candidates?: number; deleted?: unknown[]; kept?: unknown[]; error?: string } | null;
  error?: string;
}

interface RouteTiming {
  route: string;
  count: number;
  errors: number;
  p50: number;
  p95: number;
  maxMs: number;
}

export interface ServerStatus {
  version?: string;
  startedAt?: string;
  uptimeSeconds?: number;
  database?: { connected: boolean };
  drive?: { connected: boolean; user?: string; error?: string; checkedAt?: string };
  organizeJobs?: OrganizeJob[];
  lockouts?: { ip: string; wrongTries: number; lastAt?: string; lockedUntil?: string }[];
  requests?: { since?: string; total?: number; window?: number; routes?: RouteTiming[] };
}

function when(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "medium" });
}

const ms = (n?: number) => (n == null ? "—" : n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1)} s`);

function cleanupText(c: OrganizeJob["cleanup"]): string {
  if (!c) return "";
  const parts = [`${c.deleted?.length ?? 0} deleted`, `${c.kept?.length ?? 0} kept`];
  return `cleanup: ${parts.join(", ")}${c.error ? ` (error: ${c.error})` : ""}`;
}

export default function ServerPage() {
  const theme = useThemeClasses();
  useDocumentTitle("Server");
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [answeredIn, setAnsweredIn] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();
    adminFetch<ServerStatus>("/admin/status")
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        setAnsweredIn(performance.now() - started);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err?.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [checks]);

  const tile = `border rounded-xl p-4 ${theme.card}`;
  const head = `text-xs font-semibold uppercase tracking-wide ${theme.textMuted}`;
  const cell = "px-3 py-1.5 text-sm whitespace-nowrap";
  const routes = status?.requests?.routes ?? [];

  return (
    <div className={`min-h-screen p-4 sm:p-6 transition-colors duration-200 ${theme.page}`}>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Server</h1>
            <p className={`text-xs ${theme.textMuted}`}>
              Jobs, lock-outs and response times are kept in the server&apos;s memory: they start over when it restarts
              {status?.startedAt ? ` (last start ${when(status.startedAt)})` : ""}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setChecks((n) => n + 1);
            }}
            disabled={loading}
            className="self-start sm:self-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold"
          >
            {loading ? "Checking…" : "Check now"}
          </button>
        </div>

        {error && <ErrorBanner title="Couldn't reach the server" className="p-3 rounded-lg text-sm">{error}</ErrorBanner>}

        {status && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className={tile}>
                <div className={head}>Server</div>
                <div className="text-2xl font-bold">v{status.version ?? "?"}</div>
                <div className={`text-xs ${theme.textMuted}`}>up {formatUptime(status.uptimeSeconds)}</div>
              </div>
              <div className={tile}>
                <div className={head}>Render</div>
                <Light ok>Awake</Light>
                <div className={`text-xs ${theme.textMuted}`}>answered in {ms(answeredIn ?? undefined)}{answeredIn && answeredIn > 5000 ? " (it was probably asleep)" : ""}</div>
              </div>
              <div className={tile}>
                <div className={head}>Database</div>
                <Light ok={!!status.database?.connected}>{status.database?.connected ? "Connected" : "Not connected"}</Light>
              </div>
              <div className={tile}>
                <div className={head}>Google Drive</div>
                <Light ok={!!status.drive?.connected}>{status.drive?.connected ? "Connected" : "Not connected"}</Light>
                <div className={`text-xs break-words ${theme.textMuted}`}>
                  {status.drive?.error || status.drive?.user || ""}
                  {status.drive?.checkedAt ? ` · checked ${when(status.drive.checkedAt)}` : ""}
                </div>
              </div>
            </div>

            <section className={`${tile} space-y-2`}>
              <h2 className={head}>Drive sort and cleanup runs</h2>
              {(status.organizeJobs ?? []).length === 0 ? (
                <p className={`text-sm ${theme.textMuted}`}>None since the last start.</p>
              ) : (
                <ul className="divide-y divide-zinc-500/20 text-sm">
                  {status.organizeJobs!.map((j) => (
                    <li key={j.id} className="py-2 flex flex-wrap gap-x-3 gap-y-1 items-baseline">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${jobTone(j.status)}`}>{j.status ?? "?"}</span>
                      <span className="font-medium">{when(j.startedAt)}</span>
                      {j.dryRun && <span className="text-xs rounded border px-1.5 border-zinc-500/40">dry run</span>}
                      {j.trigger && <span className={`text-xs ${theme.textMuted}`}>{j.trigger}</span>}
                      {j.finishedAt && j.startedAt && (
                        <span className={`text-xs ${theme.textMuted}`}>took {ms(new Date(j.finishedAt).getTime() - new Date(j.startedAt).getTime())}</span>
                      )}
                      <span className={`basis-full text-xs ${theme.textLabel}`}>
                        {j.status === "running" && j.progress ? `${j.progress.done} of ${j.progress.total} · ` : ""}
                        {[jobCounts(j.summary), cleanupText(j.cleanup)].filter(Boolean).join(" · ")}
                        {j.error && <span className="text-red-500"> · {j.error}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${tile} space-y-2`}>
              <h2 className={head}>Wrong admin secrets (last 15 minutes)</h2>
              {(status.lockouts ?? []).length === 0 ? (
                <p className={`text-sm ${theme.textMuted}`}>None.</p>
              ) : (
                <ul className="text-sm space-y-1">
                  {status.lockouts!.map((l) => (
                    <li key={l.ip} className="flex flex-wrap gap-x-3">
                      <span className="font-mono">{maskIp(l.ip)}</span>
                      <span>{l.wrongTries} wrong</span>
                      {l.lockedUntil ? <span className="text-red-500 font-semibold">locked until {when(l.lockedUntil)}</span> : <span className={theme.textMuted}>last {when(l.lastAt)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${tile} space-y-2`}>
              <h2 className={head}>
                Response times · last {status.requests?.total != null ? Math.min(status.requests.total, status.requests.window ?? status.requests.total) : 0} requests
                {status.requests?.since ? ` since ${when(status.requests.since)}` : ""}
              </h2>
              {routes.length === 0 ? (
                <p className={`text-sm ${theme.textMuted}`}>No requests recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className={`border-b ${theme.border} ${theme.textMuted} text-xs uppercase`}>
                        <th className={`${cell} text-left`}>Route</th>
                        <th className={`${cell} text-right`}>Count</th>
                        <th className={`${cell} text-right`}>Errors</th>
                        <th className={`${cell} text-right`}>Median</th>
                        <th className={`${cell} text-right`}>p95</th>
                        <th className={`${cell} text-right`}>Slowest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routes.map((r) => (
                        <tr key={r.route} className={`border-b last:border-0 ${theme.border}`}>
                          <td className={`${cell} font-mono text-xs`}>{r.route}</td>
                          <td className={`${cell} text-right tabular-nums`}>{r.count}</td>
                          <td className={`${cell} text-right tabular-nums ${r.errors > 0 ? "text-red-500 font-semibold" : theme.textMuted}`}>{r.errors}</td>
                          <td className={`${cell} text-right tabular-nums`}>{ms(r.p50)}</td>
                          <td className={`${cell} text-right tabular-nums ${r.p95 > 2000 ? "text-amber-500 font-semibold" : ""}`}>{ms(r.p95)}</td>
                          <td className={`${cell} text-right tabular-nums ${theme.textMuted}`}>{ms(r.maxMs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function jobTone(status?: string): string {
  if (status === "done") return "bg-green-500/15 text-green-500";
  if (status === "failed") return "bg-red-500/15 text-red-500";
  return "bg-blue-500/15 text-blue-500";
}

function Light({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-lg font-bold">
      <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`} />
      {children}
    </div>
  );
}
