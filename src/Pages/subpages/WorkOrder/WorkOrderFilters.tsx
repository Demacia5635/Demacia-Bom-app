import type { ReactNode } from "react";
import { useThemeSync } from "../../../util/misc/useThemeSync";
import { MANUFACTURING_METHODS, PRIORITIES } from "./workOrderOptions";
import type WorkOrderTableRow from "./WorkOrderTableRow";
import { isFinishedRow, isPurchasedRow, toggleIn, type WorkOrderFilterState } from "./useWorkOrderFilters";

/** The filter card above the work-order table; `children` go at its bottom right (the PDF export). */
export default function WorkOrderFilters({ rows, filters, shownCount, children }: {
    rows: WorkOrderTableRow[];
    filters: WorkOrderFilterState;
    shownCount: number;
    children?: ReactNode;
}) {
    const { isLight } = useThemeSync();
    const filterCard = isLight ? "bg-white border-zinc-200" : "bg-zinc-900 border-zinc-800";
    const filterLabel = isLight ? "text-zinc-600" : "text-zinc-400";
    const chipOn = "bg-blue-600 border-blue-600 text-white";
    const chipOff = isLight
        ? "border-zinc-300 text-zinc-700 hover:bg-zinc-100"
        : "border-zinc-700 text-zinc-300 hover:bg-zinc-800";

    return (
        <div className={`mb-3 rounded-xl border p-3 space-y-2 text-xs ${filterCard}`}>
            <div className="flex flex-wrap items-center gap-1.5">
                <span className={`w-36 shrink-0 font-semibold ${filterLabel}`}>Manufacturing method</span>
                {MANUFACTURING_METHODS.map((m) => {
                    const count = rows.filter((r) => r.manufacturingMethod === m).length;
                    return (
                        <button
                            key={m}
                            type="button"
                            onClick={() => filters.setMethodFilter((list) => toggleIn(list, m))}
                            aria-pressed={filters.methodFilter.includes(m)}
                            className={`rounded-full border px-2.5 py-0.5 transition-colors ${filters.methodFilter.includes(m) ? chipOn : chipOff} ${count === 0 ? "opacity-50" : ""}`}
                        >
                            {m} <span className="opacity-70">{count}</span>
                        </button>
                    );
                })}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <span className={`w-36 shrink-0 font-semibold ${filterLabel}`}>Priority</span>
                {PRIORITIES.map((p) => {
                    const count = rows.filter((r) => r.Priority === p).length;
                    return (
                        <button
                            key={p}
                            type="button"
                            onClick={() => filters.setPriorityFilter((list) => toggleIn(list, p))}
                            aria-pressed={filters.priorityFilter.includes(p)}
                            className={`rounded-full border px-2.5 py-0.5 transition-colors ${filters.priorityFilter.includes(p) ? chipOn : chipOff} ${count === 0 ? "opacity-50" : ""}`}
                        >
                            {p} <span className="opacity-70">{count}</span>
                        </button>
                    );
                })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                    <label className={`flex items-center gap-2 cursor-pointer ${filterLabel}`}>
                        <input
                            type="checkbox"
                            checked={filters.hidePurchased}
                            onChange={(e) => filters.setHidePurchased(e.target.checked)}
                        />
                        Hide purchased & standard parts ({rows.filter(isPurchasedRow).length})
                    </label>
                    <label className={`flex items-center gap-2 cursor-pointer ${filterLabel}`}>
                        <input
                            type="checkbox"
                            checked={filters.hideFinished}
                            onChange={(e) => filters.setHideFinished(e.target.checked)}
                        />
                        Hide finished parts ({rows.filter(isFinishedRow).length})
                    </label>
                </div>
                <div className="flex items-center gap-3">
                    <span className={filterLabel}>
                        Showing {shownCount} of {rows.length} parts
                    </span>
                    {filters.rowFilter && (
                        <button
                            type="button"
                            onClick={filters.clear}
                            className="font-semibold text-blue-500 hover:underline"
                        >
                            Clear filters
                        </button>
                    )}
                    {children}
                </div>
            </div>
        </div>
    );
}
