import { useEffect, useMemo, useState } from "react";
import type WorkOrderTableRow from "./WorkOrderTableRow";

/** Made already: status "Finished Manufacturing" or priority "Finished" (the table keeps them in step). */
export const isFinishedRow = (row: WorkOrderTableRow) =>
    row.statusCode === "Finished Manufacturing" || row.Priority === "Finished";

/** Bought, not made: Onshape Standard Content, marked standard, a vendor part, or set to "Purchased". */
export const isPurchasedRow = (row: WorkOrderTableRow) =>
    !!row.isStandardContent || !!row.markedStandard || (row.vendor ?? "").trim() !== "" || row.manufacturingMethod === "Purchased";

// The work-order filters are remembered in this browser (the same for every work order).
const FILTER_STORAGE_PREFIX = "workOrderFilter:";
function readFilter(name: string): string[] {
    try {
        const saved = JSON.parse(localStorage.getItem(FILTER_STORAGE_PREFIX + name) || "[]");
        return Array.isArray(saved) ? saved.filter((v) => typeof v === "string") : [];
    } catch {
        return [];
    }
}
function writeFilter(name: string, values: string[]) {
    try {
        localStorage.setItem(FILTER_STORAGE_PREFIX + name, JSON.stringify(values));
    } catch {
        // Storage unavailable (private window): filters just aren't remembered.
    }
}

export const toggleIn = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/**
 * The work order's filters for the people making the parts: by method and
 * priority, and hiding bought or finished parts. Remembered in this browser.
 */
export function useWorkOrderFilters() {
    const [methodFilter, setMethodFilter] = useState<string[]>(() => readFilter("methods"));
    const [priorityFilter, setPriorityFilter] = useState<string[]>(() => readFilter("priorities"));
    const [hidePurchased, setHidePurchased] = useState<boolean>(() => readFilter("hidePurchased").length > 0);
    const [hideFinished, setHideFinished] = useState<boolean>(() => readFilter("hideFinished").length > 0);
    useEffect(() => {
        writeFilter("methods", methodFilter);
        writeFilter("priorities", priorityFilter);
        writeFilter("hidePurchased", hidePurchased ? ["1"] : []);
        writeFilter("hideFinished", hideFinished ? ["1"] : []);
    }, [methodFilter, priorityFilter, hidePurchased, hideFinished]);

    const rowFilter = useMemo(() => {
        if (methodFilter.length === 0 && priorityFilter.length === 0 && !hidePurchased && !hideFinished) return undefined;
        return (row: WorkOrderTableRow) =>
            (methodFilter.length === 0 || methodFilter.includes(row.manufacturingMethod)) &&
            (priorityFilter.length === 0 || priorityFilter.includes(row.Priority)) &&
            !(hidePurchased && isPurchasedRow(row)) &&
            !(hideFinished && isFinishedRow(row));
    }, [methodFilter, priorityFilter, hidePurchased, hideFinished]);

    const clear = () => {
        setMethodFilter([]);
        setPriorityFilter([]);
        setHidePurchased(false);
        setHideFinished(false);
    };

    /** The active filters in words (for the PDF export). */
    const describe = (): string[] =>
        [
            methodFilter.length > 0 && `Manufacturing method: ${methodFilter.join(", ")}`,
            priorityFilter.length > 0 && `Priority: ${priorityFilter.join(", ")}`,
            hidePurchased && "purchased & standard parts hidden",
            hideFinished && "finished parts hidden",
        ].filter((line): line is string => !!line);

    return {
        methodFilter, setMethodFilter,
        priorityFilter, setPriorityFilter,
        hidePurchased, setHidePurchased,
        hideFinished, setHideFinished,
        /** undefined when nothing is filtered. */
        rowFilter,
        clear,
        describe,
    };
}

export type WorkOrderFilterState = ReturnType<typeof useWorkOrderFilters>;
