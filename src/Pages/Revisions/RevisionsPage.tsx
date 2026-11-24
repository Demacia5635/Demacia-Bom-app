/**
 * Recent revision bumps (admin): which parts changed, "rev 3 → 4", who and
 * when, and every open work order that has the part. A part in ANY open work
 * order is flagged (⚠), whatever its status there, so nothing made or bought
 * from an old version is missed; red when it's already being made, made or
 * bought (server: GET /api/admin/revisions, admin-only).
 *
 * Route /revisions - in the sidebar's ADMIN section only.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useThemeClasses } from "../../util/misc/useThemeClasses";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import ErrorBanner from "../../components/ErrorBanner";
import { adminFetch } from "../../util/adminUnlock";
import { timeAgo } from "../Activity/activityData";
import { changedFields, revisionChange, severity, withinDays, type RevisionItem, type RevisionsReply } from "./revisionsData";

const PAGE = 100;
const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "all", label: "Everything loaded", days: null },
];

export default function RevisionsPage() {
  const theme = useThemeClasses();
  useDocumentTitle("Revisions");
  const [items, setItems] = useState<RevisionItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState("30");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    adminFetch<RevisionsReply>(`/admin/revisions?limit=${PAGE}`)
      .then((r) => {
        if (cancelled) return;
        setItems(r.items ?? []);
        setNext(r.next ?? null);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err?.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [reloads]);

  const loadMore = async () => {
    if (!next) return;
    setLoadingMore(true);
    try {
      const r = await adminFetch<RevisionsReply>(`/admin/revisions?limit=${PAGE}&before=${encodeURIComponent(next)}`);
      setItems((shown) => [...shown, ...(r.items ?? []).filter((i) => !shown.some((s) => s.event.id === i.event.id))]);
      setNext(r.next ?? null);
    } catch (err) {
      setError((err as Error)?.message || String(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const days = RANGES.find((r) => r.key === range)?.days ?? null;
  const inRange = useMemo(() => items.filter((i) => withinDays(i.event.at, days)), [items, days]);
  const flaggedCount = inRange.filter((i) => severity(i) !== "none").length;
  const highCount = inRange.filter((i) => severity(i) === "high").length;
  const shown = flaggedOnly ? inRange.filter((i) => severity(i) !== "none") : inRange;
  // The range may reach past what's loaded: offer more while the oldest loaded is still inside it.
  const oldestInRange = items.length > 0 && withinDays(items[items.length - 1].event.at, days);

  return (
    <div className={`min-h-screen p-4 sm:p-6 transition-colors duration-200 ${theme.page}`}>
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Revisions</h1>
            <p className={`text-xs ${theme.textMuted}`}>
              Parts whose revision went up. ⚠ marks every part that&apos;s in an open work order, whatever its status there; red when it&apos;s
              already being made, made or bought.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setReloads((n) => n + 1);
            }}
            disabled={loading}
            className="self-start sm:self-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold"
          >
            {loading ? "Loading…" : "Reload"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select value={range} onChange={(e) => setRange(e.target.value)} className={`border rounded-lg px-3 py-2 text-sm ${theme.input}`} aria-label="Range">
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
          <label className={`flex items-center gap-2 text-sm cursor-pointer ${theme.textLabel}`}>
            <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
            ⚠ only (in an open work order)
          </label>
          <span className={`text-sm ml-auto ${theme.textMuted}`}>
            {inRange.length} change{inRange.length === 1 ? "" : "s"} · <span className={flaggedCount ? "text-amber-500 font-semibold" : ""}>{flaggedCount} ⚠</span>
            {highCount > 0 && <span className="text-red-500 font-semibold"> ({highCount} already started)</span>}
          </span>
        </div>

        {error && <ErrorBanner title="Couldn't load the revisions" className="p-3 rounded-lg text-sm">{error}</ErrorBanner>}
        {loading && items.length === 0 && <p className={`text-sm ${theme.textMuted}`}>Loading…</p>}
        {!loading && shown.length === 0 && <p className={`text-sm ${theme.textMuted}`}>No revision changes here.</p>}

        <ul className="space-y-2">
          {shown.map((i) => <RevisionRow key={i.event.id} item={i} />)}
        </ul>

        {next && oldestInRange && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className={`px-4 py-2 rounded-lg border text-xs font-semibold hover:bg-zinc-500/10 disabled:opacity-50 ${theme.border}`}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RevisionRow({ item }: { item: RevisionItem }) {
  const theme = useThemeClasses();
  const level = severity(item);
  const fields = changedFields(item);
  const to = item.event.details?.to;
  const movedOn = item.part.revisionNow != null && to != null && String(item.part.revisionNow) !== String(to);
  const frame = level === "high" ? "border-red-500/60" : level === "flag" ? "border-amber-500/60" : "";
  return (
    <li className={`border rounded-xl p-3 sm:p-4 ${theme.cardWithText} ${frame}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {level !== "none" && (
          <AlertTriangle className={`w-4 h-4 self-center ${level === "high" ? "text-red-500" : "text-amber-500"}`} aria-label={level === "high" ? "Already started" : "In an open work order"} />
        )}
        <Link to={`/partSearch?part=${encodeURIComponent(item.part.id)}`} className="font-semibold text-blue-500 hover:underline break-words">
          {item.part.name || item.part.catalogNumber || item.part.id}
        </Link>
        {item.part.name && item.part.catalogNumber && <span className={`text-xs font-mono ${theme.textMuted}`}>{item.part.catalogNumber}</span>}
        <span className="text-sm font-bold tabular-nums">{revisionChange(item)}</span>
        {movedOn && <span className={`text-xs ${theme.textMuted}`}>(now rev {item.part.revisionNow})</span>}
        <span className={`ml-auto text-xs ${theme.textMuted}`} title={new Date(item.event.at).toLocaleString("en-GB", { timeZone: "Asia/Jerusalem" })}>
          {item.event.who ? `${item.event.who} · ` : ""}
          {timeAgo(item.event.at)}
        </span>
      </div>
      {fields.length > 0 && <div className={`mt-1 text-xs ${theme.textLabel}`}>Changed: {fields.join(", ")}</div>}
      {item.openWorkOrders.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.openWorkOrders.map((w) => {
            const started = w.status === "In manufacturing" || w.status === "Finished Manufacturing" || w.status === "Finished";
            return (
              <Link
                key={w.id}
                to={`/workOrder/${encodeURIComponent(w.id)}?part=${encodeURIComponent(item.part.id)}`}
                className={`rounded-lg border px-2 py-0.5 text-xs hover:underline ${started ? "border-red-500/60 text-red-500" : "border-amber-500/60 text-amber-500"}`}
              >
                {w.name || w.id}: {w.status || "no status"}
                {w.method ? ` · ${w.method}` : ""}
              </Link>
            );
          })}
        </div>
      )}
    </li>
  );
}
