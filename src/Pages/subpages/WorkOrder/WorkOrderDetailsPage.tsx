import { useEffect, useMemo, useState, useRef, useCallback, type MouseEvent } from "react";
import { useParams } from "react-router-dom";
import { fetchFromApi, AuthenticatedImage, type ApiError } from "../../../util/ApiService";
import { collectBomParts } from "../../../util/bomParts";
import { useThemeSync } from "../../../util/misc/useThemeSync";
import Table from "../../../components/Table";
import WorkOrderColumns, { MANUFACTURING_METHODS, PRIORITIES } from "./WorkOrderColumns";
import type WorkOrderTableRow from "./WorkOrderTableRow";
import type { BomModel, PartModel, WorkorderModel } from "../../../util/Models";
import WorkOrderDataUI from "./WorkOrderDataUI";
import PartPortal from "../../../Pages/searchPartsPage/PartPortal";
import { recordImageSrc } from "../../../util/recordImage";
import { fetchPartsByIds } from "../../../util/records";
import { printPartsPdf } from "../../../util/exportPartsPdf";

// Comprehensive sanitizer to check all potential database fields for the real Onshape name
const getCleanPartName = (record: any, entityID: string) => {
    // 1. Check alternative database / Onshape metadata fields
    if (record?.title && typeof record.title === 'string' && !record.title.includes('_')) return record.title;
    if (record?.partName && typeof record.partName === 'string' && !record.partName.includes('_')) return record.partName;
    if (record?.fileName && typeof record.fileName === 'string' && !record.fileName.includes('_')) return record.fileName;
    if (record?.properties?.name && typeof record.properties.name === 'string' && !record.properties.name.includes('_')) return record.properties.name;
    if (record?.metadata?.name && typeof record.metadata.name === 'string' && !record.metadata.name.includes('_')) return record.metadata.name;

    const rawName = record?.name;
    
    // 2. If rawName is a clean human-readable name (does not contain underscores)
    if (rawName && typeof rawName === 'string' && !rawName.includes('_') && rawName.length < 50) {
        return rawName;
    }

    // 3. Fall back to catalog number or description if they contain clean text
    if (record?.catalogNumber && typeof record.catalogNumber === 'string' && record.catalogNumber.trim() !== '' && !record.catalogNumber.includes('_')) {
        return record.catalogNumber;
    }
    if (record?.description && typeof record.description === 'string' && record.description.trim() !== '' && !record.description.includes('_') && record.description.length < 50) {
        return record.description;
    }

    // 4. Final fallback: If the database record genuinely only has the compound ID, 
    // display a clean fallback or part identifier rather than a blank cell or raw ID string.
    if (entityID && entityID.includes('_')) {
        const segments = entityID.split('_');
        return `Part ${segments[segments.length - 1]}`;
    }

    return rawName || entityID;
};

const ISRAEL_TIME = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
});

/**
 * Israel time as yy/MM/dd-HH:mm:ss (e.g. 26/11/14-19:05:00), which also sorts
 * correctly as text. "" for no or invalid dates.
 */
function formatIsraelTime(value: Date | string | undefined | null): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const p = Object.fromEntries(ISRAEL_TIME.formatToParts(date).map((part) => [part.type, part.value]));
    return `${p.year}/${p.month}/${p.day}-${p.hour}:${p.minute}:${p.second}`;
}

/** Columns saved to the work order's part entry (the rest come from the part / BOM). */
const SAVED_PART_FIELDS = [
    "statusCode",
    "Priority",
    "manufacturingMethod",
    "productionMakingOwner",
    "comments",
    "links",
    "approxArrivalDate",
] as const satisfies readonly (keyof WorkOrderTableRow)[];

/** Made already: status "Finished Manufacturing" or priority "Finished" (the table keeps them in step). */
const isFinishedRow = (row: WorkOrderTableRow) =>
    row.statusCode === "Finished Manufacturing" || row.Priority === "Finished";

/** Bought, not made: Onshape Standard Content, a vendor part, or set to "Purchased". */
const isPurchasedRow = (row: WorkOrderTableRow) =>
    !!row.isStandardContent || (row.vendor ?? "").trim() !== "" || row.manufacturingMethod === "Purchased";

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

const toggleIn = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export default function WorkOrderDetailsPage() {
    const { workOrderID } = useParams<{ workOrderID: string }>();
    const { isLight } = useThemeSync();

    const [rows, setRows] = useState<WorkOrderTableRow[]>([]);
    const [error, setError] = useState<ApiError | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [workOrderData, setWorkOrderData] = useState<WorkorderModel | null>(null);
    const [assemblyThumbnailUrl] = useState<string>(""); // image now comes from the BOM record

    const [selectedPart, setSelectedPart] = useState<PartModel | null>(null);
    const [isPartPortalOpen, setIsPartPortalOpen] = useState<boolean>(false);
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        row: WorkOrderTableRow;
    } | null>(null);
    const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null);

    const rowPartMapRef = useRef<Map<string, string>>(new Map());
    /** Edits waiting to be saved, per row (merged until the save goes out). */
    const pendingSavesRef = useRef<Map<string, { changes: Record<string, unknown>; timer?: ReturnType<typeof setTimeout> }>>(new Map());
    const [saveError, setSaveError] = useState<string | null>(null);

    const parseStatusToString = (code: number | string | undefined): string => {
        if (code === 1 || code === '1' || code === 'In Planning') return 'In Planning';
        if (code === 2 || code === '2' || code === 'Manufacturing approved') return 'Manufacturing approved';
        if (code === 3 || code === '3' || code === 'In manufacturing') return 'In manufacturing';
        if (code === 4 || code === '4' || code === 'Finished Manufacturing') return 'Finished Manufacturing';
        if (code === 'Untracked') return 'Untracked';
        return typeof code === 'string' && code.trim() !== '' ? code : 'In Planning';
    };

    useEffect(() => {
        const handleClickOutside = () => setContextMenu(null);
        window.addEventListener("click", handleClickOutside);
        return () => window.removeEventListener("click", handleClickOutside);
    }, []);

    // Dropdown colours come from WorkOrderColumns (valueClass), set on every render.

    useEffect(() => {
        if (!workOrderID) return;
        // Switching work orders: nothing of the previous one stays on screen, and
        // its late replies are ignored.
        let cancelled = false;
        setWorkOrderData(null);
        setRows([]);
        setError(null);

        async function getWOData() {
            try {
                const data = await fetchFromApi<WorkorderModel>(`/db/workOrder/id/${workOrderID}`);
                if (!cancelled) setWorkOrderData(data);

                // The assembly image comes from the BOM record (WorkOrderDataUI).
            } catch (err: any) {
                if (!cancelled) setError(err);
            }
        }
        getWOData();
        return () => { cancelled = true; };
    }, [workOrderID]);

    useEffect(() => {
        // Only the work order in the URL (not the previous one, still loaded for a moment).
        if (!workOrderID || !workOrderData || !workOrderData.bomID || workOrderData.id !== workOrderID) return;
        let cancelled = false;

        async function fetchBomPartsRecursively(targetBomId: string): Promise<Map<string, number>> {
            const aggregated = new Map<string, number>();
            const fetchBom = (id: string) => fetchFromApi<BomModel>(`/db/bom/id/${id}`);
            for (const [partID, quantity] of await collectBomParts(fetchBom, targetBomId, 1)) {
                aggregated.set(partID, (aggregated.get(partID) || 0) + quantity);
            }
            return aggregated;
        }

        async function getPartsData(): Promise<WorkOrderTableRow[]> {
            const aggregatedQuantities = await fetchBomPartsRecursively(workOrderData!.bomID!);
            const collectedRows: WorkOrderTableRow[] = [];
            // Not cleared: row ids include the work order id, and a save still
            // waiting for a row of the previous work order looks its part up here.

            // All parts in one request instead of one per part.
            const partRecords = await fetchPartsByIds([...aggregatedQuantities.keys()]);

            for (const [partID, totalQty] of aggregatedQuantities.entries()) {
                let part: PartModel | null = partRecords.get(partID) ?? null;

                if (!part) {
                    part = {
                        id: partID,
                        name: partID,
                        catalogNumber: "",
                        material: "",
                        comments: "",
                        onshapeURL: "",
                        stlLink: "",
                        parasolidLink: "",
                    } as any;
                }

                const existingWoPart = workOrderData?.parts?.find((p: any) => p.partID === partID);

                let avatarUrl = recordImageSrc(part as any);

                const rowId = `${workOrderID}-part-${partID}`;
                rowPartMapRef.current.set(rowId, partID);

                const partRow: WorkOrderTableRow = {
                    id: rowId,
                    parentId: null,
                    isExpanded: false,
                    avatar: avatarUrl,
                    // Empty until the part is first changed in this work order.
                    lastUpadte: formatIsraelTime(existingWoPart?.updatedAt),
                    productionMakingOwner: (existingWoPart as any)?.productionMakingOwner || "",
                    catalogNumber: part?.catalogNumber || "",
                    name: getCleanPartName(part, partID),
                    quantityTotal: totalQty,
                    statusCode: parseStatusToString(existingWoPart?.statusCode),
                    approxArrivalDate: (existingWoPart as any)?.approxArrivalDate || "",
                    manufacturingMethod: (existingWoPart as any)?.manufacturingMethod || (part as any)?.manufacturingMethod || "Manual",
                    material: (existingWoPart as any)?.material || part?.material || "",
                    Priority: (existingWoPart as any)?.Priority || "Medium",
                    comments: (existingWoPart as any)?.comments || part?.comments || "",
                    links: (existingWoPart as any)?.links || (part as any)?.links || "",
                    onshapeURL: part?.onshapeURL || "",
                    exportSTL: part?.stlLink || "",
                    exportParasolid: part?.parasolidLink || "",
                    vendor: part?.vendor || "",
                    isStandardContent: !!part?.isStandardContent,
                };
                collectedRows.push(partRow);
            }
            return collectedRows;
        }

        setLoading(true);
        getPartsData()
            .then((data) => { if (!cancelled) setRows(data); })
            .catch((err: ApiError) => { if (!cancelled) setError(err); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [workOrderID, workOrderData]);

    /**
     * Saves edits to the database like the BOM page: shortly after the last
     * change, but per part and only the fields that changed, so people editing
     * different parts of the same work order don't overwrite each other.
     */
    const queueSave = useCallback((rowId: string, changes: Record<string, unknown>) => {
        const partID = rowPartMapRef.current.get(rowId);
        if (!workOrderID || !partID) return;

        const pending = pendingSavesRef.current.get(rowId) ?? { changes: {}, timer: undefined };
        Object.assign(pending.changes, changes);
        if (pending.timer) clearTimeout(pending.timer);
        pending.timer = setTimeout(async () => {
            pendingSavesRef.current.delete(rowId);
            try {
                const saved = await fetchFromApi<{ updatedAt?: string } | null>(
                    `/db/workOrder/id/${encodeURIComponent(workOrderID)}/part`,
                    { method: "POST", body: JSON.stringify({ partID, changes: pending.changes }) }
                );
                if (saved?.updatedAt) {
                    setRows((current) => current.map((r) => (r.id === rowId ? { ...r, lastUpadte: formatIsraelTime(saved.updatedAt) } : r)));
                }
            } catch (err: any) {
                console.error("Failed to save work order changes:", err);
                setSaveError(`Couldn't save the change to "${rows.find((r) => r.id === rowId)?.name ?? partID}": ${err?.message || err}`);
            }
        }, 600);
        pendingSavesRef.current.set(rowId, pending);
    }, [workOrderID, rows]);

    const handleTableDataChange = (newData: WorkOrderTableRow[]) => {
        const processedData = newData.map((newRow) => {
            const oldRow = rows.find(r => r.id === newRow.id);
            const updated = { ...newRow };

            if (oldRow) {
                // Parts made elsewhere or bought aren't tracked through manufacturing.
                if (oldRow.manufacturingMethod !== updated.manufacturingMethod && (updated.manufacturingMethod === 'Externally produced' || updated.manufacturingMethod === 'Purchased')) {
                    updated.statusCode = 'Untracked';
                }

                if (oldRow.statusCode !== updated.statusCode && updated.statusCode === 'Finished Manufacturing') {
                    updated.Priority = 'Finished';
                } else if (oldRow.Priority !== updated.Priority && updated.Priority === 'Finished') {
                    updated.statusCode = 'Finished Manufacturing';
                }
            }

            return updated;
        });

        setRows(processedData);

        // Save what changed, part by part (expanding a row etc. saves nothing).
        const oldById = new Map(rows.map((r) => [r.id, r]));
        for (const row of processedData) {
            const old = oldById.get(row.id);
            if (!old) continue;
            const changes: Record<string, unknown> = {};
            for (const field of SAVED_PART_FIELDS) {
                if (row[field] !== old[field]) changes[field] = row[field];
            }
            if (Object.keys(changes).length > 0) queueSave(row.id, changes);
        }
    };

    /** The row a table <tr> shows (the Table tags each one with its row ID). */
    const rowFromElement = (tr: Element): WorkOrderTableRow | undefined => {
        const id = tr.getAttribute("data-row-id");
        return id ? rows.find((r) => r.id === id) : undefined;
    };

    // ---- Filters for the people making the parts (remembered in this browser) ----
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
    const shownCount = useMemo(() => (rowFilter ? rows.filter(rowFilter).length : rows.length), [rows, rowFilter]);

    // ---- Export the shown parts (image, name, quantity) to PDF ----
    const tableAreaRef = useRef<HTMLDivElement>(null);
    /** null when idle; otherwise images loaded so far. */
    const [pdfProgress, setPdfProgress] = useState<{ loaded: number; total: number } | null>(null);

    const handleExportPdf = async () => {
        // The rows as the table shows them: filtered and in its sort order.
        const shownRows = Array.from(tableAreaRef.current?.querySelectorAll("tr[data-row-id]") ?? [])
            .map(rowFromElement)
            .filter((r): r is WorkOrderTableRow => !!r);
        if (shownRows.length === 0) {
            window.alert("No parts are shown, so there's nothing to export.");
            return;
        }

        const filters = [
            methodFilter.length > 0 && `Manufacturing method: ${methodFilter.join(", ")}`,
            priorityFilter.length > 0 && `Priority: ${priorityFilter.join(", ")}`,
            hidePurchased && "purchased & standard parts hidden",
            hideFinished && "finished parts hidden",
        ].filter(Boolean);

        setPdfProgress({ loaded: 0, total: 0 });
        try {
            await printPartsPdf({
                title: workOrderData?.name || "Work order",
                subtitleLines: [
                    workOrderData?.bomName ? `Assembly: ${workOrderData.bomName}` : "",
                    filters.length > 0 ? `Filters: ${filters.join(" · ")}` : "All parts",
                    `Exported ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Jerusalem" })}`,
                ],
                rows: shownRows.map((r) => ({
                    name: r.name,
                    catalogNumber: r.catalogNumber,
                    quantity: r.quantityTotal,
                    imageSrc: r.avatar,
                })),
                onProgress: (loaded, total) => setPdfProgress({ loaded, total }),
            });
        } catch (err: any) {
            console.error("PDF export failed:", err);
            window.alert(`Couldn't export the PDF: ${err?.message || err}`);
        } finally {
            setPdfProgress(null);
        }
    };

    const handleTableClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const cellEl = target.closest(".table-td, td");
        if (!cellEl) return;

        const trEl = cellEl.closest(".table-tr, tr");
        if (!trEl) return;

        // By ID: with sorting or filters the on-screen order isn't the order of `rows`.
        const clickedRow = rowFromElement(trEl);
        if (clickedRow) {
            const cellsInRow = Array.from(trEl.querySelectorAll(".table-td, td"));
            const cellIndex = cellsInRow.indexOf(cellEl);

            if (cellIndex === 0) {
                setEnlargedImageSrc(clickedRow.avatar || "FAILED");
            }
        }
    };

    const handleTableContextMenuCapture = (e: MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const rowEl = target.closest(".table-tr, tr");
        if (!rowEl) return;

        e.preventDefault();
        e.stopPropagation();

        const row = rowFromElement(rowEl);
        if (row) {
            setContextMenu({
                x: e.clientX,
                y: e.clientY,
                row,
            });
        }
    };

    const handleShowPartData = async (row: WorkOrderTableRow) => {
        setContextMenu(null);
        const partId = rowPartMapRef.current.get(row.id) || (row as any).entityID;
        if (!partId) return;

        try {
            const partData = await fetchFromApi<PartModel>(`/db/part/id/${encodeURIComponent(partId)}`);
            setSelectedPart(partData);
            setIsPartPortalOpen(true);
        } catch (err: any) {
            if (err?.statusCode === 404) {
                window.alert(`"${row.name || partId}" isn't saved in the database yet. Publish the BOM from the extension first.`);
                return;
            }
            console.error("Failed to fetch part data for modal portal", err);
        }
    };

    const pageBg = isLight ? "bg-zinc-50 text-zinc-900" : "bg-zinc-950 text-zinc-100";
    const loadingText = isLight ? "text-zinc-500" : "text-zinc-400";
    const filterCard = isLight ? "bg-white border-zinc-200" : "bg-zinc-900 border-zinc-800";
    const filterLabel = isLight ? "text-zinc-600" : "text-zinc-400";
    const chipOn = "bg-blue-600 border-blue-600 text-white";
    const chipOff = isLight
        ? "border-zinc-300 text-zinc-700 hover:bg-zinc-100"
        : "border-zinc-700 text-zinc-300 hover:bg-zinc-800";

    return (
        <div className={`p-8 min-h-screen transition-colors duration-200 ${pageBg}`}>
            <div className="flex justify-end mb-4">
                
            </div>

            {workOrderData && (
                <WorkOrderDataUI 
                    workOrder={workOrderData} 
                    assemblyThumbnailURL={assemblyThumbnailUrl} 
                />
            )}
            {error && (
                <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
                    <p className="font-semibold">Error Loading Work Order Data</p>
                    <p>{error.message}</p>
                    {error.statusCode && <p className="text-sm">HTTP Status Code: {error.statusCode}</p>}
                </div>
            )}

            {saveError && (
                <div className="mb-4 flex items-start justify-between gap-3 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm">
                    <span>{saveError}</span>
                    <button type="button" onClick={() => setSaveError(null)} className="shrink-0 text-xs font-semibold hover:underline">
                        Dismiss
                    </button>
                </div>
            )}

            {loading ? (
                <div className={`p-8 text-center ${loadingText}`}>Fetching Work Order parts...</div>
            ) : (
                <>
                {rows.length > 0 && (
                    <div className={`mb-3 rounded-xl border p-3 space-y-2 text-xs ${filterCard}`}>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`w-36 shrink-0 font-semibold ${filterLabel}`}>Manufacturing method</span>
                            {MANUFACTURING_METHODS.map((m) => {
                                const count = rows.filter((r) => r.manufacturingMethod === m).length;
                                return (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => setMethodFilter((list) => toggleIn(list, m))}
                                        aria-pressed={methodFilter.includes(m)}
                                        className={`rounded-full border px-2.5 py-0.5 transition-colors ${methodFilter.includes(m) ? chipOn : chipOff} ${count === 0 ? "opacity-50" : ""}`}
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
                                        onClick={() => setPriorityFilter((list) => toggleIn(list, p))}
                                        aria-pressed={priorityFilter.includes(p)}
                                        className={`rounded-full border px-2.5 py-0.5 transition-colors ${priorityFilter.includes(p) ? chipOn : chipOff} ${count === 0 ? "opacity-50" : ""}`}
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
                                        checked={hidePurchased}
                                        onChange={(e) => setHidePurchased(e.target.checked)}
                                    />
                                    Hide purchased & standard parts ({rows.filter(isPurchasedRow).length})
                                </label>
                                <label className={`flex items-center gap-2 cursor-pointer ${filterLabel}`}>
                                    <input
                                        type="checkbox"
                                        checked={hideFinished}
                                        onChange={(e) => setHideFinished(e.target.checked)}
                                    />
                                    Hide finished parts ({rows.filter(isFinishedRow).length})
                                </label>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={filterLabel}>
                                    Showing {shownCount} of {rows.length} parts
                                </span>
                                {rowFilter && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMethodFilter([]);
                                            setPriorityFilter([]);
                                            setHidePurchased(false);
                                            setHideFinished(false);
                                        }}
                                        className="font-semibold text-blue-500 hover:underline"
                                    >
                                        Clear filters
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={handleExportPdf}
                                    disabled={pdfProgress !== null || shownCount === 0}
                                    title="Save the parts shown below (image, name, quantity) as a PDF"
                                    className="rounded-lg bg-blue-600 px-3 py-1 font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-default"
                                >
                                    {pdfProgress === null
                                        ? "Export PDF"
                                        : pdfProgress.total > 0
                                            ? `Loading images ${pdfProgress.loaded}/${pdfProgress.total}…`
                                            : "Preparing PDF…"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                <div
                    ref={tableAreaRef}
                    onClick={handleTableClick}
                    onContextMenuCapture={handleTableContextMenuCapture} 
                    className="relative cursor-pointer"
                >
                    <Table
                        data={rows}
                        columnsData={WorkOrderColumns}
                        newRowFunction={undefined}
                        setData={(newData) => handleTableDataChange(newData as WorkOrderTableRow[])}
                        // Like Excel's freeze panes: header row + avatar and name stay visible.
                        stickyHeader
                        frozenColumns={2}
                        rowFilter={rowFilter}
                    />

                    {contextMenu && (
                        <div
                            className="context-menu"
                            style={{ top: contextMenu.y, left: contextMenu.x }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                type="button"
                                onClick={() => handleShowPartData(contextMenu.row)}
                            >
                                Show Part Data
                            </button>
                        </div>
                    )}
                </div>
                </>
            )}

            {isPartPortalOpen && selectedPart && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <button
                            type="button"
                            onClick={() => setIsPartPortalOpen(false)}
                            className="absolute top-4 right-4 z-10 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold"
                        >
                            ✕ Close
                        </button>
                        <PartPortal part={selectedPart} />
                    </div>
                </div>
            )}

            {enlargedImageSrc && (
                <div 
                    className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
                    onClick={() => setEnlargedImageSrc(null)}
                >
                    <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={() => setEnlargedImageSrc(null)}
                            className="absolute -top-10 right-0 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold shadow-md"
                        >
                            ✕ Close
                        </button>
                        {enlargedImageSrc === "FAILED" || !enlargedImageSrc ? (
                            <div className="w-96 h-96 bg-zinc-900 border border-zinc-700 rounded-xl flex flex-col items-center justify-center text-zinc-400 gap-2 shadow-2xl">
                                <span className="text-xl font-bold">Image Failed to Load</span>
                                <span className="text-xs font-mono text-zinc-500">NO IMAGE AVAILABLE</span>
                            </div>
                        ) : (
                            <AuthenticatedImage
                                src={enlargedImageSrc}
                                alt="Enlarged Preview"
                                className="max-w-full max-h-[85vh] object-contain rounded-xl border border-zinc-700 shadow-2xl"
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}