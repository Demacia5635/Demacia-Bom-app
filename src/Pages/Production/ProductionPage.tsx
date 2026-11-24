/**
 * Manufacturing board (admin): every open work order's progress, its parts by
 * status, what's blocked (bought items still "To buy", made parts with no
 * material), and the queue per process (server: GET /api/admin/production,
 * admin-only). Finished orders sit in a collapsed "Done" list.
 *
 * Route /production - in the sidebar's ADMIN section only.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useThemeClasses } from "../../util/misc/useThemeClasses";
import { useThemeSync } from "../../util/misc/useThemeSync";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import ErrorBanner from "../../components/ErrorBanner";
import { adminFetch } from "../../util/adminUnlock";
import { valueColour } from "../Subpages/WorkOrder/workOrderOptions";
import { blockedCount, sortedCounts, splitOrders, type ProductionOrder, type ProductionReply } from "./productionData";

/** Status chips in the work-order table's colours. */
const TONES: Record<string, [light: string, dark: string]> = {
  "status-bg-orange": ["bg-orange-100 text-orange-800", "bg-orange-500/25 text-orange-200"],
  "status-bg-blue": ["bg-blue-100 text-blue-800", "bg-blue-500/25 text-blue-200"],
  "status-bg-green": ["bg-green-100 text-green-800", "bg-green-600/25 text-green-200"],
  "status-bg-red": ["bg-red-100 text-red-800", "bg-red-500/25 text-red-200"],
};
const PLAIN: [string, string] = ["bg-zinc-100 text-zinc-700", "bg-zinc-800 text-zinc-300"];

export default function ProductionPage() {
  const theme = useThemeClasses();
  useDocumentTitle("Production");
  const [data, setData] = useState<ProductionReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    adminFetch<ProductionReply>("/admin/production")
      .then((r) => {
        if (cancelled) return;
        setData(r);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err?.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [reloads]);

  const { open, done } = useMemo(() => splitOrders(data?.orders ?? []), [data]);
  const queues = sortedCounts(data?.totals.byMethodOpen);
  const toBuy = open.reduce((n, o) => n + (o.blocked?.toBuy ?? 0), 0);
  const noMaterial = open.reduce((n, o) => n + (o.blocked?.noMaterial ?? 0), 0);
  const tile = `border rounded-xl p-3 ${theme.card}`;

  return (
    <div className={`min-h-screen p-4 sm:p-6 transition-colors duration-200 ${theme.page}`}>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Production</h1>
            <p className={`text-xs ${theme.textMuted}`}>
              Open work orders (not every part finished or bought yet), what&apos;s blocking them, and how many parts wait per process.
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

        {error && <ErrorBanner title="Couldn't load the board" className="p-3 rounded-lg text-sm">{error}</ErrorBanner>}
        {loading && !data && <p className={`text-sm ${theme.textMuted}`}>Loading…</p>}

        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className={tile}>
                <div className={`text-xs ${theme.textMuted}`}>Open orders</div>
                <div className="text-2xl font-bold">{data.totals.open}</div>
              </div>
              <div className={tile}>
                <div className={`text-xs ${theme.textMuted}`}>Blocked orders</div>
                <div className={`text-2xl font-bold ${data.totals.blockedOrders > 0 ? "text-red-500" : ""}`}>{data.totals.blockedOrders}</div>
              </div>
              <div className={tile}>
                <div className={`text-xs ${theme.textMuted}`}>Still to buy</div>
                <div className={`text-2xl font-bold ${toBuy > 0 ? "text-orange-500" : ""}`}>{toBuy}</div>
              </div>
              <div className={tile}>
                <div className={`text-xs ${theme.textMuted}`}>Made parts with no material</div>
                <div className={`text-2xl font-bold ${noMaterial > 0 ? "text-orange-500" : ""}`}>{noMaterial}</div>
              </div>
            </div>

            <section className={`${tile} space-y-2`}>
              <h2 className={`text-xs font-semibold uppercase tracking-wide ${theme.textMuted}`}>Waiting per process (unfinished made parts)</h2>
              {queues.length === 0 ? (
                <p className={`text-sm ${theme.textMuted}`}>Nothing waiting.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {queues.map(([method, n]) => (
                    <span key={method} className={`rounded-lg border px-3 py-1.5 text-sm ${theme.border}`}>
                      {method} <span className="font-bold tabular-nums">{n}</span>
                    </span>
                  ))}
                  {toBuy > 0 && (
                    <span className="rounded-lg border border-orange-500/50 px-3 py-1.5 text-sm text-orange-500">
                      To buy <span className="font-bold tabular-nums">{toBuy}</span>
                    </span>
                  )}
                </div>
              )}
            </section>

            {open.length === 0 ? (
              <p className={`text-sm ${theme.textMuted}`}>No open work orders.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {open.map((o) => <OrderCard key={o.id} order={o} />)}
              </div>
            )}

            {done.length > 0 && (
              <details className={`border rounded-xl ${theme.card}`}>
                <summary className="cursor-pointer select-none p-4 text-sm font-semibold">Done ({done.length})</summary>
                <ul className="px-4 pb-3 divide-y divide-zinc-500/20 text-sm">
                  {done.map((o) => (
                    <li key={o.id} className="py-2 flex flex-wrap gap-x-3">
                      <Link to={`/workOrder/${encodeURIComponent(o.id)}`} className="font-medium text-blue-500 hover:underline">
                        {o.name || o.id}
                      </Link>
                      {o.owner && <span className={theme.textMuted}>{o.owner}</span>}
                      <span className={`ml-auto ${theme.textMuted}`}>{o.madeParts ?? 0} made · {o.purchased?.lines ?? 0} bought</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function OrderCard({ order: o }: { order: ProductionOrder }) {
  const theme = useThemeClasses();
  const { isLight } = useThemeSync();
  const percent = Math.max(0, Math.min(100, Math.round(o.percent ?? 0)));
  const blocked = blockedCount(o) > 0;
  return (
    <Link
      to={`/workOrder/${encodeURIComponent(o.id)}`}
      className={`block border rounded-xl p-4 space-y-2 hover:border-blue-500 transition-colors ${theme.cardWithText} ${blocked ? "border-red-500/50" : ""}`}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-semibold break-words min-w-0">{o.name || o.id}</span>
        {o.owner && <span className={`text-xs ${theme.textMuted}`}>{o.owner}</span>}
        {!o.error && <span className="ml-auto text-sm font-bold tabular-nums">{percent}%</span>}
      </div>

      {o.error ? (
        <p className="text-sm text-red-500">Couldn&apos;t read its BOM: {o.error}</p>
      ) : (
        <>
          <div className="h-2 rounded-full bg-zinc-500/20 overflow-hidden" title={`${o.finishedParts ?? 0} of ${o.madeParts ?? 0} made parts finished`}>
            <div className="h-full rounded-full bg-green-500" style={{ width: `${percent}%` }} />
          </div>
          <div className={`text-xs ${theme.textMuted}`}>
            {o.finishedParts ?? 0} of {o.madeParts ?? 0} made parts finished
            {o.purchased && o.purchased.lines > 0 ? ` · bought: ${o.purchased.finished} of ${o.purchased.lines} in` : ""}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sortedCounts(o.byStatus).map(([status, n]) => (
              <span key={status} className={`rounded-full px-2 py-0.5 text-xs font-medium ${(TONES[valueColour(status) ?? ""] ?? PLAIN)[isLight ? 0 : 1]}`}>
                {status} {n}
              </span>
            ))}
          </div>
          {blocked && (
            <p className="text-xs font-semibold text-red-500">
              Blocked:{" "}
              {[
                o.blocked!.toBuy ? `${o.blocked!.toBuy} still to buy` : "",
                o.blocked!.noMaterial ? `${o.blocked!.noMaterial} made part${o.blocked!.noMaterial === 1 ? "" : "s"} with no material` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </>
      )}
    </Link>
  );
}
