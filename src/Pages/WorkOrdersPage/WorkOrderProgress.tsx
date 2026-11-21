import { useThemeClasses } from "../../util/misc/useThemeClasses";
import type { WorkOrderSummary } from "./workOrderSummary";

/** The statuses shown in the summary line, in workflow order (others after). */
const STATUS_ORDER = ["In Planning", "Manufacturing approved", "In manufacturing", "Finished Manufacturing"];

/**
 * A work order's progress in the list (QW14): a bar of finished / made parts
 * and a status summary line, from the server's work-order summary.
 */
export default function WorkOrderProgress({ summary }: { summary: WorkOrderSummary }) {
  const theme = useThemeClasses();
  if (summary.error) {
    return <p className="text-xs text-amber-600" title={summary.error}>⚠ Progress unavailable: {summary.error}</p>;
  }
  const made = summary.madeParts ?? 0;
  const finished = summary.finishedParts ?? 0;
  const percent = made > 0 ? Math.round((finished / made) * 100) : 0;
  const statuses = Object.entries(summary.byStatus ?? {})
    .filter(([status, count]) => status !== "Untracked" && count > 0)
    .sort(([a], [b]) => {
      const ia = STATUS_ORDER.indexOf(a), ib = STATUS_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  const qty = summary.madeQty != null ? `${summary.finishedQty ?? 0} of ${summary.madeQty} pieces finished` : undefined;

  return (
    <div className="mt-1.5 space-y-1">
      {made > 0 ? (
        <div className="flex items-center gap-2" title={qty}>
          <div
            role="progressbar"
            aria-label="Finished parts"
            aria-valuemin={0}
            aria-valuemax={made}
            aria-valuenow={finished}
            className={`h-1.5 w-40 max-w-full rounded-full overflow-hidden ${theme.imageBox}`}
          >
            <div className={`h-full rounded-full ${percent === 100 ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${percent}%` }} />
          </div>
          <span className={`text-xs tabular-nums ${theme.textMuted}`}>
            {finished}/{made} finished ({percent}%)
          </span>
        </div>
      ) : (
        <p className={`text-xs ${theme.textMuted}`}>No parts to make (all bought or untracked)</p>
      )}
      {statuses.length > 0 && (
        <p className={`text-xs ${theme.textMuted}`}>{statuses.map(([status, count]) => `${count} ${status.toLowerCase()}`).join(" · ")}</p>
      )}
    </div>
  );
}
