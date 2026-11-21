import { useEffect, useMemo, useState, useRef, type MouseEvent } from "react";
import { useParams } from "react-router-dom";
import { fetchFromApi, type ApiError } from "../../../util/ApiService";
import { loadBomTree, workOrderLines } from "../../../util/bomTree";
import { useThemeSync } from "../../../util/misc/useThemeSync";
import Table from "../../../components/Table";
import WorkOrderColumns from "./WorkOrderColumns";
import type WorkOrderTableRow from "./WorkOrderTableRow";
import type { BomModel, PartModel, WorkorderModel } from "../../../util/Models";
import WorkOrderDataUI from "./WorkOrderDataUI";
import PartPortal from "../../../Pages/searchPartsPage/PartPortal";
import SubAssemblySummary from "../Bom/SubAssemblySummary";
import { recordImageSrc } from "../../../util/recordImage";
import { fetchPartsByIds } from "../../../util/records";
import { partDisplayName } from "../../../util/partDisplayName";
import { readShowSize, writeShowSize } from "../../../util/partSize";
import { toCncGroups } from "./cncGroups";
import ImageLightbox from "../../../components/ImageLightbox";
import RecordDialog from "../../../components/RecordDialog";
import { useRowContextMenu } from "../../../components/useRowContextMenu";
import { useDebouncedFieldSave } from "../../../components/useDebouncedFieldSave";
import { useCncGroups } from "./useCncGroups";
import { toggleIn, useWorkOrderFilters } from "./useWorkOrderFilters";
import WorkOrderFilters from "./WorkOrderFilters";
import { useWorkOrderPdfExport } from "./useWorkOrderPdfExport";

/** The table columns without Size, for when "Show size" is off. */
const COLUMNS_WITHOUT_SIZE = WorkOrderColumns.filter((c) => c.key !== "size");

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
    "links",
    "approxArrivalDate",
] as const satisfies readonly (keyof WorkOrderTableRow)[];


export default function WorkOrderDetailsPage() {
    const { workOrderID } = useParams<{ workOrderID: string }>();
    const { isLight } = useThemeSync();

    const [rows, setRows] = useState<WorkOrderTableRow[]>([]);
    const [error, setError] = useState<ApiError | null>(null);
    // True from the start: the parts load right after the work order, so the
    // table never flashes empty first.
    const [loading, setLoading] = useState<boolean>(true);
    const [workOrderData, setWorkOrderData] = useState<WorkorderModel | null>(null);

    const [selectedPart, setSelectedPart] = useState<PartModel | null>(null);
    // A bought sub-assembly's line without a part record: its summary, as on the BOM page.
    const [selectedSubBom, setSelectedSubBom] = useState<BomModel | null>(null);
    const { menu: contextMenu, openFor: openContextMenu, close: closeContextMenu } = useRowContextMenu<WorkOrderTableRow>();
    const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null);

    const rowPartMapRef = useRef<Map<string, string>>(new Map());
    /** Edits waiting to be saved, per row (merged until the save goes out). */
    const [saveError, setSaveError] = useState<string | null>(null);
    // The assembly's name, from the BOM loaded for the rows (work orders don't store it).
    const [bomName, setBomName] = useState<{ workOrderID: string; name: string } | null>(null);
    /** "Show size" checkbox, shared with the BOM page (remembered in this browser). */
    const [showSize, setShowSize] = useState(readShowSize);
    useEffect(() => writeShowSize(showSize), [showSize]);

    // ---- CNC groups: parts cut in one run, sharing one Links cell (useCncGroups.ts) ----
    const {
        cncGroups,
        setCncGroups,
        displayRows,
        mergeSelection,
        setMergeSelection,
        groupSaving,
        mergeParts,
        removeFromGroup,
        queueGroupLinks,
        suggestions,
        unsizedCount,
    } = useCncGroups(workOrderID, rows, setSaveError);

    const parseStatusToString = (code: number | string | undefined): string => {
        if (code === 1 || code === '1' || code === 'In Planning') return 'In Planning';
        if (code === 2 || code === '2' || code === 'Manufacturing approved') return 'Manufacturing approved';
        if (code === 3 || code === '3' || code === 'In manufacturing') return 'In manufacturing';
        if (code === 4 || code === '4' || code === 'Finished Manufacturing') return 'Finished Manufacturing';
        if (code === 'Untracked') return 'Untracked';
        return typeof code === 'string' && code.trim() !== '' ? code : 'In Planning';
    };


    // Dropdown colours come from WorkOrderColumns (valueClass), set on every render.

    useEffect(() => {
        if (!workOrderID) return;
        // Another work order is a new page (App.tsx keys it by id); a late reply
        // after leaving is ignored.
        let cancelled = false;

        async function getWOData() {
            try {
                const data = await fetchFromApi<WorkorderModel>(`/db/workOrder/id/${workOrderID}`);
                if (cancelled) return;
                setWorkOrderData(data);
                // Its CNC groups as loaded (later changes come back from the server).
                setCncGroups(toCncGroups(data?.cncGroups));
                // No assembly: no parts to load (the page says so).
                if (!data?.bomID) setLoading(false);

                // The assembly image comes from the BOM record (WorkOrderDataUI).
            } catch (err: any) {
                if (!cancelled) {
                    setError(err);
                    setLoading(false);
                }
            }
        }
        getWOData();
        return () => { cancelled = true; };
    }, [workOrderID, setCncGroups]);

    useEffect(() => {
        // Only the work order in the URL (not the previous one, still loaded for a moment).
        if (!workOrderID || !workOrderData || !workOrderData.bomID || workOrderData.id !== workOrderID) return;
        let cancelled = false;

        async function getPartsData(): Promise<WorkOrderTableRow[]> {
            // The live BOM (util/bomTree.ts, as when the work order was made): its
            // parts with their totals, a bought sub-assembly as one purchased row.
            const tree = await loadBomTree(workOrderData!.bomID!, (root) => {
                if (!cancelled && root?.name) setBomName({ workOrderID: workOrderID!, name: root.name });
            });
            const { totals: aggregatedQuantities, bought: boughtAssemblies } = workOrderLines(tree);
            const collectedRows: WorkOrderTableRow[] = [];
            // Not cleared: row ids include the work order id, and a save still
            // waiting for a row of the previous work order looks its part up here.

            // The tree has every part listed in a BOM; only a bought sub-assembly's
            // own part record (saved under its BOM id) may still be needed.
            const missing = [...aggregatedQuantities.keys()].filter((id) => !tree.parts.has(id));
            const extraRecords = missing.length > 0 ? await fetchPartsByIds(missing) : new Map<string, PartModel>();

            for (const [partID, totalQty] of aggregatedQuantities.entries()) {
                let part: PartModel | null = tree.parts.get(partID) ?? extraRecords.get(partID) ?? null;
                const boughtBom = boughtAssemblies.get(partID);

                if (!part && boughtBom) {
                    // A bought sub-assembly without its own part record: shown by its BOM record.
                    part = {
                        id: partID,
                        name: boughtBom.name,
                        catalogNumber: boughtBom.catalogNumber || "",
                        description: boughtBom.description,
                        avatarID: boughtBom.avatarID,
                        onshapeURL: boughtBom.onshapeURL || "",
                        vendor: boughtBom.vendor,
                        markedStandard: boughtBom.markedStandard,
                    };
                } else if (!part) {
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

                const existingWoPart = workOrderData?.parts?.find((p) => p.partID === partID);

                let avatarUrl = recordImageSrc(part);

                const rowId = `${workOrderID}-part-${partID}`;
                rowPartMapRef.current.set(rowId, partID);

                const partRow: WorkOrderTableRow = {
                    id: rowId,
                    parentId: null,
                    isExpanded: false,
                    avatar: avatarUrl,
                    // Empty until the part is first changed in this work order.
                    lastUpadte: formatIsraelTime(existingWoPart?.updatedAt),
                    productionMakingOwner: existingWoPart?.productionMakingOwner || "",
                    catalogNumber: part?.catalogNumber || "",
                    name: partDisplayName(part, partID),
                    size: part?.size || "",
                    partID,
                    quantityTotal: totalQty,
                    // A bought sub-assembly not saved in this work order yet (one made
                    // before they were listed whole) starts as bought, like on creation.
                    statusCode: boughtBom && !existingWoPart ? "Untracked" : parseStatusToString(existingWoPart?.statusCode),
                    approxArrivalDate: existingWoPart?.approxArrivalDate || "",
                    manufacturingMethod: existingWoPart?.manufacturingMethod || (part as any)?.manufacturingMethod || (boughtBom ? "Purchased" : "Manual"),
                    // Not stored per work order (the server keeps no material there): the part's.
                    material: part?.material || "",
                    Priority: existingWoPart?.Priority || "Medium",
                    comments: existingWoPart?.comments || part?.comments || "",
                    links: existingWoPart?.links || (part as any)?.links || "",
                    onshapeURL: part?.onshapeURL || "",
                    exportSTL: part?.stlLink || "",
                    exportParasolid: part?.parasolidLink || "",
                    vendor: part?.vendor || "",
                    isStandardContent: !!part?.isStandardContent,
                    markedStandard: !!part?.markedStandard,
                };
                collectedRows.push(partRow);
            }
            return collectedRows;
        }

        // (loading is already true: this runs once, when the work order arrives)
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
    // Keyed by row; `name` only labels a failure message.
    const queueRowSave = useDebouncedFieldSave<{ updatedAt?: string } | null>({
        save: (rowId, changes) =>
            fetchFromApi<{ updatedAt?: string } | null>(
                `/db/workOrder/id/${encodeURIComponent(workOrderID!)}/part`,
                { method: "POST", body: JSON.stringify({ partID: rowPartMapRef.current.get(rowId), changes }) }
            ),
        onSaved: (rowId, saved) => {
            if (saved?.updatedAt) {
                setRows((current) => current.map((r) => (r.id === rowId ? { ...r, lastUpadte: formatIsraelTime(saved.updatedAt) } : r)));
            }
        },
        onFailed: (rowId, err: any, name) => {
            console.error("Failed to save work order changes:", err);
            setSaveError(`Couldn't save the change to "${name || rowPartMapRef.current.get(rowId)}": ${err?.message || err}`);
        },
    });
    const queueSave = (rowId: string, changes: Record<string, unknown>, name?: string) => {
        if (!workOrderID || !rowPartMapRef.current.get(rowId)) return;
        queueRowSave(rowId, changes, name);
    };



    const handleTableDataChange = (newData: WorkOrderTableRow[]) => {
        const shownById = new Map(displayRows.map((r) => [r.id, r]));
        const ownById = new Map(rows.map((r) => [r.id, r]));
        const processedData = newData.map((newRow) => {
            const oldRow = shownById.get(newRow.id);
            const updated = { ...newRow };

            // A merged Links cell belongs to its group: saved there, and the
            // part keeps its own links (shown again if it leaves the group).
            if (updated.cncGroupID) {
                if (oldRow && updated.links !== oldRow.links) queueGroupLinks(updated.cncGroupID, updated.links);
                updated.links = ownById.get(updated.id)?.links ?? "";
                updated.cncGroupID = undefined;
            }

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

        // Kept in their own (BOM) order: newData is in the shown order, with CNC
        // groups pulled together, and a part that later leaves its group should
        // go back to its place. No rows are added or removed here (no newRowFunction).
        const processedById = new Map(processedData.map((r) => [r.id, r]));
        setRows(rows.map((r) => processedById.get(r.id) ?? r));

        // Save what changed, part by part (expanding a row etc. saves nothing).
        const oldById = ownById;
        for (const row of processedData) {
            const old = oldById.get(row.id);
            if (!old) continue;
            const changes: Record<string, unknown> = {};
            for (const field of SAVED_PART_FIELDS) {
                if (row[field] !== old[field]) changes[field] = row[field];
            }
            if (Object.keys(changes).length > 0) queueSave(row.id, changes, row.name);
        }
    };

    /**
     * A part saved in Part Portal: its row shows the new name and catalog number,
     * and the new material / comments where the row showed the part's own (not
     * ones set in this work order).
     */
    const handlePartSaved = (saved: PartModel) => {
        const before = selectedPart;
        setRows((current) => current.map((r) => {
            if (r.partID !== saved.id) return r;
            return {
                ...r,
                name: partDisplayName(saved, saved.id),
                catalogNumber: saved.catalogNumber || "",
                material: r.material === (before?.material || "") ? saved.material || "" : r.material,
                comments: r.comments === (before?.comments || "") ? saved.comments || "" : r.comments,
            };
        }));
    };

    /** The row a table <tr> shows (the Table tags each one with its row ID). */
    const rowFromElement = (tr: Element): WorkOrderTableRow | undefined => {
        const id = tr.getAttribute("data-row-id");
        return id ? rows.find((r) => r.id === id) : undefined;
    };

    // ---- Filters for the people making the parts (remembered in this browser) ----
    const filters = useWorkOrderFilters();
    const { rowFilter } = filters;
    const shownCount = useMemo(() => (rowFilter ? rows.filter(rowFilter).length : rows.length), [rows, rowFilter]);

    // ---- Export the shown parts (image, name, quantity) to PDF ----
    const { tableAreaRef, pdfProgress, exportPdf: handleExportPdf } = useWorkOrderPdfExport({
        rowFromElement,
        title: workOrderData?.name || "Work order",
        assemblyName: bomName?.workOrderID === workOrderID ? bomName?.name : undefined,
        filterLines: filters.describe(),
    });

    const handleTableClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const cellEl = target.closest(".table-td, td");
        if (!cellEl) return;

        const trEl = cellEl.closest(".table-tr, tr");
        if (!trEl) return;

        // By ID: with sorting or filters the on-screen order isn't the order of `rows`.
        const clickedRow = rowFromElement(trEl);
        // By column, not position: columns can be dragged into another order,
        // and merged Links cells leave some rows with fewer cells.
        if (clickedRow && cellEl.getAttribute("data-col-key") === "avatar") {
            setEnlargedImageSrc(clickedRow.avatar || "FAILED");
        }
    };

    const handleTableContextMenuCapture = (e: MouseEvent<HTMLDivElement>) => openContextMenu(e, rowFromElement);

    const handleShowPartData = async (row: WorkOrderTableRow) => {
        closeContextMenu();
        const partId = rowPartMapRef.current.get(row.id) || row.partID;
        if (!partId) return;

        try {
            const partData = await fetchFromApi<PartModel>(`/db/part/id/${encodeURIComponent(partId)}`);
            setSelectedPart(partData);
        } catch (err: any) {
            if (err?.statusCode === 404) {
                // A bought sub-assembly is listed by its BOM id (collectBomParts) and
                // may have no part record: show its summary instead.
                const subBom = await fetchFromApi<BomModel>(`/db/bom/id/${encodeURIComponent(partId)}`).catch(() => null);
                if (subBom) {
                    setSelectedSubBom(subBom);
                    return;
                }
                window.alert(`"${row.name || partId}" isn't saved in the database yet. Publish the BOM from the extension first.`);
                return;
            }
            console.error("Failed to fetch part data for modal portal", err);
            window.alert(`Couldn't load "${row.name || partId}": ${err?.message || "an unexpected error occurred."}`);
        }
    };

    const pageBg = isLight ? "bg-zinc-50 text-zinc-900" : "bg-zinc-950 text-zinc-100";
    const loadingText = isLight ? "text-zinc-500" : "text-zinc-400";
    const filterCard = isLight ? "bg-white border-zinc-200" : "bg-zinc-900 border-zinc-800";
    const filterLabel = isLight ? "text-zinc-600" : "text-zinc-400";

    return (
        <div className={`p-8 min-h-screen transition-colors duration-200 ${pageBg}`}>

            {workOrderData && (
                <WorkOrderDataUI workOrder={workOrderData} />
            )}
            {/* Under the title card: the note on the left, "Show size" on the right. */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 -mt-3 mb-3">
                {/* Rows and quantities are built from the live BOM, not a snapshot (B9). */}
                <p className={`text-xs ${loadingText}`}>
                    Parts and quantities follow the assembly&apos;s current BOM: publishing it again updates this work order.
                </p>
                <label className={`flex items-center gap-2 cursor-pointer text-sm ${filterLabel}`} title="Each made part&apos;s size in Onshape (bounding box, longest side first), saved by Publish BOM. Empty for bought parts and parts published before sizes were saved.">
                    <input type="checkbox" checked={showSize} onChange={(e) => setShowSize(e.target.checked)} />
                    Show size
                </label>
            </div>
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
            ) : workOrderData && !workOrderData.bomID ? (
                <div className={`p-8 text-center ${loadingText}`}>This work order isn&apos;t linked to an assembly, so it has no parts to show.</div>
            ) : (
                <>
                {rows.length > 0 && (
                    <WorkOrderFilters rows={rows} filters={filters} shownCount={shownCount}>
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
                    </WorkOrderFilters>
                )}
                {rows.length > 0 && (suggestions.length > 0 || mergeSelection.length > 0 || cncGroups.length > 0 || unsizedCount > 0) && (
                    <div className={`mb-3 rounded-xl border p-3 space-y-1.5 text-xs ${filterCard}`}>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span
                                className={`font-semibold ${filterLabel}`}
                                title="Parts with the same thickness (smallest side of their size, to 0.1 mm) and material can be cut in one CNC run. Merged parts sit together and share one Links cell (for the G-code)."
                            >
                                CNC merge
                            </span>
                            <span className={filterLabel}>
                                {cncGroups.length > 0 ? `${cncGroups.length} merged job${cncGroups.length === 1 ? "" : "s"}. ` : ""}
                                Right-click a part to select it for a merge by hand, or to remove it from its job.
                                {unsizedCount > 0 ? ` ${unsizedCount} part${unsizedCount === 1 ? " has" : "s have"} no saved size (publish the BOM again from the extension) and can only be merged by hand.` : ""}
                            </span>
                        </div>
                        {suggestions.map((sug) => (
                            <div key={sug.label} className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    disabled={groupSaving}
                                    onClick={() => void mergeParts(sug.partIDs)}
                                    className="rounded-lg bg-blue-600 px-2.5 py-0.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                                >
                                    Merge {sug.partIDs.length}
                                </button>
                                <span className="font-semibold">{sug.label}:</span>
                                <span className={filterLabel}>{sug.names.join(", ")}</span>
                            </div>
                        ))}
                        {mergeSelection.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    disabled={groupSaving || mergeSelection.length + (cncGroups.some((g) => g.partIDs.some((p) => mergeSelection.includes(p))) ? 1 : 0) < 2}
                                    onClick={() => void mergeParts(mergeSelection)}
                                    className="rounded-lg bg-blue-600 px-2.5 py-0.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                                    title="Merge the selected parts into one CNC job (if one of them is already in a job, the others join it)"
                                >
                                    Merge selected ({mergeSelection.length})
                                </button>
                                <button type="button" onClick={() => setMergeSelection([])} className="font-semibold text-blue-500 hover:underline">
                                    Clear
                                </button>
                                <span className={filterLabel}>
                                    {rows.filter((r) => r.partID && mergeSelection.includes(r.partID)).map((r) => r.name).join(", ")}
                                </span>
                            </div>
                        )}
                    </div>
                )}
                <div
                    ref={tableAreaRef}
                    onClick={handleTableClick}
                    onContextMenuCapture={handleTableContextMenuCapture} 
                    className="relative cursor-pointer"
                >
                    <Table
                        data={displayRows}
                        columnsData={showSize ? WorkOrderColumns : COLUMNS_WITHOUT_SIZE}
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
                            {contextMenu.row.partID && (() => {
                                const partID = contextMenu.row.partID!;
                                const selected = mergeSelection.includes(partID);
                                const inGroup = cncGroups.some((g) => g.partIDs.includes(partID));
                                return (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMergeSelection((list) => toggleIn(list, partID));
                                                closeContextMenu();
                                            }}
                                        >
                                            {selected ? "Unselect for CNC merge" : "Select for CNC merge"}
                                        </button>
                                        {inGroup && (
                                            <button
                                                type="button"
                                                disabled={groupSaving}
                                                onClick={() => {
                                                    closeContextMenu();
                                                    void removeFromGroup(contextMenu.row);
                                                }}
                                            >
                                                Remove from CNC job
                                            </button>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>
                </>
            )}

            {selectedSubBom && (
              <RecordDialog onClose={() => setSelectedSubBom(null)}>
                <SubAssemblySummary bom={selectedSubBom} />
              </RecordDialog>
            )}

            {selectedPart && (
              <RecordDialog onClose={() => setSelectedPart(null)}>
                <PartPortal key={selectedPart.id} part={selectedPart} onSaved={handlePartSaved} />
              </RecordDialog>
            )}

            <ImageLightbox src={enlargedImageSrc} onClose={() => setEnlargedImageSrc(null)} />
        </div>
    );
}