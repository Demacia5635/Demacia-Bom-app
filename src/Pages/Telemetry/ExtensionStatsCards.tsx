import { useMemo } from "react";
import { useThemeClasses } from "../../util/misc/useThemeClasses";
import { commonErrors, publishStats, versionsInUse, type StatsEvent } from "./extensionStats";

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" });
}

/**
 * The extension's health on /tele: versions in use (every user in the range),
 * Publish BOM success and time, and the most common errors (the user picked,
 * if any).
 */
export default function ExtensionStatsCards({ allEvents, events }: { allEvents: StatsEvent[]; events: StatsEvent[] }) {
  const theme = useThemeClasses();
  const versions = useMemo(() => versionsInUse(allEvents), [allEvents]);
  const publish = useMemo(() => publishStats(events), [events]);
  const errors = useMemo(() => commonErrors(events), [events]);
  const head = `text-xs font-semibold uppercase tracking-wide ${theme.textMuted}`;
  const rate = publish.successRate;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <section className={`border rounded-xl p-4 space-y-2 ${theme.card}`}>
        <h2 className={head}>Extension versions in use</h2>
        {versions.length === 0 ? (
          <p className={`text-sm ${theme.textMuted}`}>No events in this range.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {versions.map((v) => (
              <li key={`${v.version}|${v.browser}`} className="flex gap-2 items-baseline">
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-mono font-semibold ${
                    v.latest ? "bg-green-500/15 text-green-500" : v.version === "?" ? "bg-zinc-500/15" : "bg-amber-500/15 text-amber-500"
                  }`}
                >
                  {v.version === "?" ? "unknown" : v.version}
                </span>
                {v.browser && <span className={`shrink-0 text-xs ${theme.textMuted}`}>{v.browser}</span>}
                <span className="min-w-0 break-words">{v.users.join(", ")}</span>
              </li>
            ))}
          </ul>
        )}
        <p className={`text-[11px] ${theme.textMuted}`}>
          From each user&apos;s newest event in this range. Firefox users who declined usage statistics don&apos;t appear.
        </p>
      </section>

      <section className={`border rounded-xl p-4 space-y-2 ${theme.card}`}>
        <h2 className={head}>Publish BOM</h2>
        {publish.total === 0 ? (
          <p className={`text-sm ${theme.textMuted}`}>No publishes in this range.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className={`text-xs ${theme.textMuted}`}>Succeeded</div>
              <div className={`text-2xl font-bold ${rate !== null && rate < 0.9 ? "text-amber-500" : ""}`}>{rate === null ? "—" : `${Math.round(rate * 100)}%`}</div>
              <div className={`text-xs ${theme.textMuted}`}>{publish.ok} of {publish.total}</div>
            </div>
            <div>
              <div className={`text-xs ${theme.textMuted}`}>Average time</div>
              <div className="text-2xl font-bold">{formatMs(publish.avgMs)}</div>
              <div className={`text-xs ${theme.textMuted}`}>{publish.msPerItem !== null ? `${formatMs(publish.msPerItem)} per item` : "per item: newer versions only"}</div>
            </div>
            {publish.withProblems > 0 && (
              <p className="col-span-2 text-xs text-amber-500">{publish.withProblems} succeeded with problems (e.g. a thumbnail that failed).</p>
            )}
          </div>
        )}
      </section>

      <section className={`border rounded-xl p-4 space-y-2 ${theme.card}`}>
        <h2 className={head}>Most common errors</h2>
        {errors.length === 0 ? (
          <p className={`text-sm ${theme.textMuted}`}>No failures in this range.</p>
        ) : (
          <ol className="space-y-1.5 text-sm">
            {errors.map((e) => (
              <li key={e.key} className="flex gap-2 items-baseline">
                <span className="shrink-0 w-8 text-right font-bold tabular-nums">{e.count}×</span>
                <span className="min-w-0">
                  <span className={`break-words ${e.coded ? "font-mono text-xs font-semibold" : ""}`} title={e.example}>{e.key}</span>
                  <span className={`block text-[11px] ${theme.textMuted}`}>
                    {e.actions.join(", ")} · last {formatWhen(e.lastAt)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
