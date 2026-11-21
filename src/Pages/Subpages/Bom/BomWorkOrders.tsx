import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchFromApi } from "../../../util/ApiService";
import type { WorkOrderModel } from "../../../util/Models";
import { useThemeClasses } from "../../../util/misc/useThemeClasses";

const DATE = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "2-digit" });
const formatDate = (iso: string | undefined) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? DATE.format(d) : "";
};

/**
 * "Work orders for this assembly" under the BOM page's header (QW4): each
 * links to its work order, newest first. Uses ?bomID= on the list route; an
 * older server ignores it, so the list is also filtered here.
 */
export default function BomWorkOrders({ bomId }: { bomId: string }) {
  const theme = useThemeClasses();
  const [workOrders, setWorkOrders] = useState<WorkOrderModel[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFromApi<WorkOrderModel[]>(`/db/workOrder/all?bomID=${encodeURIComponent(bomId)}`)
      .then((list) => {
        if (cancelled) return;
        const mine = (list || []).filter((wo) => wo.bomID === bomId);
        mine.sort((a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0));
        setWorkOrders(mine);
      })
      .catch((err) => console.error("Couldn't load this assembly's work orders:", err));
    return () => {
      cancelled = true;
    };
  }, [bomId]);

  if (!workOrders) return null;
  return (
    <section aria-label="Work orders for this assembly" className={`print:hidden mb-4 rounded-xl border px-4 py-3 text-sm ${theme.card}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className={`text-xs font-semibold uppercase tracking-wide ${theme.textLabel}`}>
          Work orders for this assembly ({workOrders.length})
        </h2>
        {workOrders.length === 0 && (
          <span className={`text-xs ${theme.textMuted}`}>None yet. "Create Work Order" above makes one.</span>
        )}
        {workOrders.map((wo) => (
          <Link
            key={wo.id}
            to={`/workOrder/${encodeURIComponent(wo.id)}`}
            className={`inline-flex items-baseline gap-1.5 rounded-full border px-3 py-1 hover:border-blue-500 hover:text-blue-500 ${theme.border} ${theme.textValue}`}
          >
            <span className="font-medium">{wo.name || "Unnamed work order"}</span>
            {(wo.workOrderOwner || wo.createdAt) && (
              <span className={`text-xs ${theme.textMuted}`}>
                {[wo.workOrderOwner, formatDate(wo.createdAt)].filter(Boolean).join(" · ")}
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
