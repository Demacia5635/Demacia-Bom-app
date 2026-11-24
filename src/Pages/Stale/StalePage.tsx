/**
 * Out-of-date work orders (admin): orders whose parts changed since they were
 * made: a revision went up, a BOM quantity changed, or parts were added to or
 * removed from the BOM. Orders made before work orders kept a snapshot only
 * know that a part was saved since ("maybe changed", greyed) (server: GET
 * /api/admin/stale, admin-only).
 *
 * Route /stale - in the sidebar's ADMIN section only.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useThemeClasses } from "../../util/misc/useThemeClasses";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import ErrorBanner from "../../components/ErrorBanner";
import { adminFetch } from "../../util/adminUnlock";
import { partChanges, sortStale, type StaleOrder } from "./staleData";

function day(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { timeZone: "Asia/Jerusalem" });
}

export default function StalePage() {
  const theme = useThemeClasses();
  useDocumentTitle("Stale work orders");
  const [orders, setOrders] = useState<StaleOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloads, setReloads] = useState(0);
  const [showFinished, setShowFinished] = useState(false);
  const [showMaybe, setShowMaybe] = useState(true);

  useEffect(() => {
    let cancelled = false;
    adminFetch<StaleOrder[]>("/admin/stale")
      .then((r) => {
        if (cancelled) return;
        setOrders(r ?? []);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err?.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [reloads]);

  const all = useMemo(() => sortStale(orders ?? []), [orders]);
  const shown = all.filter((o) => (showFinished || o.open) && (showMaybe || o.snapshot));
  const exactOpen = all.filter((o) => o.open && o.snapshot).length;
  const maybeOpen = all.filter((o) => o.open && !o.snapshot).length;
  const finished = all.filter((o) => !o.open).length;

  return (
    <div className={`min-h-screen p-4 sm:p-6 transition-colors duration-200 ${theme.page}`}>
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Stale work orders</h1>
            <p className={`text-xs ${theme.textMuted}`}>
              Work orders whose parts changed since the order was made. Orders made before orders kept a snapshot can only show parts saved
              since then (greyed: maybe changed).
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
            {loading ? "Checking…" : "Check again"}
          </button>
        </div>

        {orders && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className={exactOpen ? "text-red-500 font-semibold" : theme.textMuted}>{exactOpen} open order{exactOpen === 1 ? "" : "s"} changed</span>
            <span className={theme.textMuted}>{maybeOpen} maybe changed</span>
            <label className={`flex items-center gap-2 cursor-pointer ${theme.textLabel}`}>
              <input type="checkbox" checked={showMaybe} onChange={(e) => setShowMaybe(e.target.checked)} />
              Show &quot;maybe changed&quot;
            </label>
            <label className={`flex items-center gap-2 cursor-pointer ${theme.textLabel}`}>
              <input type="checkbox" checked={showFinished} onChange={(e) => setShowFinished(e.target.checked)} />
              Show finished orders ({finished})
            </label>
          </div>
        )}

        {error && <ErrorBanner title="Couldn't check the work orders" className="p-3 rounded-lg text-sm">{error}</ErrorBanner>}
        {loading && !orders && <p className={`text-sm ${theme.textMuted}`}>Checking every work order against its BOM…</p>}
        {orders && shown.length === 0 && <p className="text-sm text-green-500">No work order here has changed parts.</p>}

        <ul className="space-y-3">
          {shown.map((o) => {
            const rows = partChanges(o.parts);
            return (
              <li
                key={o.workOrder.id}
                className={`border rounded-xl p-4 space-y-2 ${theme.cardWithText} ${o.snapshot ? (o.open ? "border-red-500/50" : "") : "opacity-70"}`}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link to={`/workOrder/${encodeURIComponent(o.workOrder.id)}`} className="font-semibold text-blue-500 hover:underline break-words">
                    {o.workOrder.name || o.workOrder.id}
                  </Link>
                  {o.workOrder.owner && <span className={`text-xs ${theme.textMuted}`}>{o.workOrder.owner}</span>}
                  {!o.open && <span className="text-xs rounded px-1.5 py-0.5 bg-green-500/15 text-green-500">finished</span>}
                  {!o.snapshot && <span className="text-xs rounded px-1.5 py-0.5 bg-zinc-500/20">maybe changed</span>}
                  <span className={`ml-auto text-xs ${theme.textMuted}`}>
                    made {day(o.workOrder.createdAt)} · {rows.length} part{rows.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="divide-y divide-zinc-500/20 text-sm">
                  {rows.map((r) => (
                    <li key={r.partID} className="py-1.5 flex flex-wrap gap-x-3">
                      <Link
                        to={`/workOrder/${encodeURIComponent(o.workOrder.id)}?part=${encodeURIComponent(r.partID)}`}
                        className={`font-medium hover:underline ${r.maybe ? theme.textMuted : ""}`}
                      >
                        {r.name}
                      </Link>
                      <span className={r.maybe ? theme.textMuted : "text-red-500 font-semibold"}>{r.changes.join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
