import { useEffect, useState, useRef, useCallback, type MouseEvent } from "react";
import { useParams } from "react-router-dom";
import { fetchFromApi, AuthenticatedImage, type ApiError } from "../../util/ApiService";
import { useThemeSync } from "../../util/misc/useThemeSync";
import Table from "../../components/Table";
import WorkOrderColumns from "./WorkOrderColumns";
import type WorkOrderTableRow from "./WorkOrderTableRow";
import type { BomModel, PartModel, WorkorderModel } from "../../util/Models";
import WorkOrderDataUI from "./WorkOrderDataUI";
import PartPortal from "../../Pages/searchPartsPage/PartPortal";

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

export default function WorkOrderDetailsPage() {
    const { workOrderID } = useParams<{ workOrderID: string }>();
    const { isLight, toggleTheme } = useThemeSync();

    const [rows, setRows] = useState<WorkOrderTableRow[]>([]);
    const [error, setError] = useState<ApiError | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [workOrderData, setWorkOrderData] = useState<WorkorderModel | null>(null);
    const [assemblyThumbnailUrl, setAssemblyThumbnailUrl] = useState<string>("");

    const [selectedPart, setSelectedPart] = useState<PartModel | null>(null);
    const [isPartPortalOpen, setIsPartPortalOpen] = useState<boolean>(false);
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        row: WorkOrderTableRow;
    } | null>(null);
    const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null);

    const rowPartMapRef = useRef<Map<string, string>>(new Map());
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    // Select color sync effect for dropdowns
    useEffect(() => {
        const syncSelectElements = () => {
            const selects = document.querySelectorAll(".cell-select");
            selects.forEach((el) => {
                const select = el as HTMLSelectElement;
                const val = select.value;
                
                select.setAttribute("value", val);
                select.classList.remove("status-bg-orange", "status-bg-blue", "status-bg-green", "status-bg-red");

                if (["In Planning", "In manufacturing", "Medium", "Manual"].includes(val)) {
                    select.classList.add("status-bg-orange");
                } else if (["Manufacturing approved", "Milled", "Lathed", "CNC", "Printed", "Externally produced", "Untracked"].includes(val)) {
                    select.classList.add("status-bg-blue");
                } else if (["Finished Manufacturing", "Low", "Finished"].includes(val)) {
                    select.classList.add("status-bg-green");
                } else if (["CATNUM Written", "High"].includes(val)) {
                    select.classList.add("status-bg-red");
                }
            });
        };

        const timer = setTimeout(syncSelectElements, 30);
        const handleChange = () => setTimeout(syncSelectElements, 10);
        
        document.addEventListener("change", handleChange);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("change", handleChange);
        };
    }, [rows, isLight]);
    
    useEffect(() => {
        if (!workOrderID) return;

        async function getWOData() {
            try {
                const data = await fetchFromApi<WorkorderModel>(`/db/workOrder/id/${workOrderID}`);
                setWorkOrderData(data);

                if ((data as any)?.onshapeID?.documentID && (data as any)?.onshapeID?.elementID) {
                    const { documentID, wvmType = "w", wvmID, elementID } = (data as any).onshapeID;
                    setAssemblyThumbnailUrl(`/api/onshape/bom/d/${documentID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elementID}/thumbnail`);
                }
            } catch (err: any) {
                setError(err);
            }
        }
        getWOData();
    }, [workOrderID]);

    useEffect(() => {
        if (!workOrderID || !workOrderData || !workOrderData.bomID) return;

        async function fetchBomPartsRecursively(
            targetBomId: string,
            multiplier: number = 1,
            accMap: Map<string, number> = new Map()
        ): Promise<Map<string, number>> {
            const currentBom = await fetchFromApi<BomModel>(`/db/bom/id/${targetBomId}`);

            for (const sub of currentBom.subAssemblies || []) {
                const subQuantity = (sub.quantity ?? 1) * multiplier;
                await fetchBomPartsRecursively(sub.bomID, subQuantity, accMap);
            }

            for (const p of currentBom.parts || []) {
                const partQuantity = (p.quantity ?? 1) * multiplier;
                const existingQty = accMap.get(p.partID) || 0;
                accMap.set(p.partID, existingQty + partQuantity);
            }

            return accMap;
        }

        async function getPartsData(): Promise<WorkOrderTableRow[]> {
            const aggregatedQuantities = await fetchBomPartsRecursively(workOrderData!.bomID!);
            const collectedRows: WorkOrderTableRow[] = [];
            rowPartMapRef.current.clear();

            for (const [partID, totalQty] of aggregatedQuantities.entries()) {
                let part: PartModel | null = null;
                
                try {
                    part = await fetchFromApi<PartModel>(`/db/part/id/${partID}`);
                } catch {
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

                let avatarUrl = "";
                if (part?.onshapeID?.documentID && part?.onshapeID?.elementID) {
                    const { documentID, wvmType = "w", wvmID, elementID, partID: oidPartID } = part.onshapeID;
                    const targetPartID = oidPartID || partID;
                    avatarUrl = `/api/onshape/part/d/${documentID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elementID}/p/${targetPartID}/thumbnail`;
                }

                const rowId = `${workOrderID}-part-${partID}`;
                rowPartMapRef.current.set(rowId, partID);

                const partRow: WorkOrderTableRow = {
                    id: rowId,
                    parentId: null,
                    isExpanded: false,
                    avatar: avatarUrl,
                    lastUpadte: existingWoPart?.updatedAt || new Date(),
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
                    vendor: part?.vendor || ""
                };
                collectedRows.push(partRow);
            }
            return collectedRows;
        }

        setLoading(true);
        getPartsData()
            .then((data) => setRows(data))
            .catch((err: ApiError) => setError(err))
            .finally(() => setLoading(false));
    }, [workOrderID, workOrderData]);

    // Debounced background sync to Work Order collection in DB
    const debouncedSaveToDb = useCallback((currentRows: WorkOrderTableRow[]) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = setTimeout(async () => {
            if (!workOrderID) return;

            try {
                const partsPayload = currentRows.map((row) => {
                    const partId = rowPartMapRef.current.get(row.id);
                    return {
                        partID: partId,
                        quantityTotal: row.quantityTotal,
                        statusCode: row.statusCode,
                        Priority: row.Priority,
                        manufacturingMethod: row.manufacturingMethod,
                        productionMakingOwner: row.productionMakingOwner,
                        comments: row.comments,
                        links: row.links,
                        approxArrivalDate: row.approxArrivalDate,
                        updatedAt: new Date(),
                    };
                });

                await fetch(`/api/db/workOrder/id/${workOrderID}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-client-secret": import.meta.env.VITE_CLIENT_SECRET || "",
                    },
                    body: JSON.stringify({ parts: partsPayload }),
                });
            } catch (err) {
                console.error("Failed to sync work order changes to database:", err);
            }
        }, 600);
    }, [workOrderID]);

    const handleTableDataChange = (newData: WorkOrderTableRow[]) => {
        const processedData = newData.map((newRow) => {
            const oldRow = rows.find(r => r.id === newRow.id);
            const updated = { ...newRow };

            if (oldRow) {
                if (oldRow.manufacturingMethod !== updated.manufacturingMethod && updated.manufacturingMethod === 'Externally produced') {
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
        debouncedSaveToDb(processedData);
    };

    const handleTableClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const cellEl = target.closest(".table-td, td");
        if (!cellEl) return;

        const trEl = cellEl.closest(".table-tr, tr");
        if (!trEl) return;

        const tbody = trEl.closest("tbody") || trEl.parentElement;
        if (!tbody) return;

        const trs = Array.from(tbody.querySelectorAll(".table-tr, tr"));
        const rowIndex = trs.indexOf(trEl);

        if (rowIndex !== -1 && rows[rowIndex]) {
            const clickedRow = rows[rowIndex];
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

        const tbody = rowEl.closest("tbody") || rowEl.parentElement;
        if (!tbody) return;

        const trs = Array.from(tbody.querySelectorAll(".table-tr, tr"));
        const rowIndex = trs.indexOf(rowEl);

        if (rowIndex !== -1 && rows[rowIndex]) {
            setContextMenu({
                x: e.clientX,
                y: e.clientY,
                row: rows[rowIndex],
            });
        }
    };

    const handleShowPartData = async (row: WorkOrderTableRow) => {
        setContextMenu(null);
        const partId = rowPartMapRef.current.get(row.id) || (row as any).entityID;
        if (!partId) return;

        try {
            const partData = await fetchFromApi<PartModel>(`/db/part/id/${partId}`);
            setSelectedPart(partData);
            setIsPartPortalOpen(true);
        } catch (err) {
            console.error("Failed to fetch part data for modal portal", err);
        }
    };

    const pageBg = isLight ? "bg-zinc-50 text-zinc-900" : "bg-zinc-950 text-zinc-100";
    const loadingText = isLight ? "text-zinc-500" : "text-zinc-400";

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

            {loading ? (
                <div className={`p-8 text-center ${loadingText}`}>Fetching Work Order parts...</div>
            ) : (
                <div 
                    onClick={handleTableClick}
                    onContextMenuCapture={handleTableContextMenuCapture} 
                    className="relative cursor-pointer"
                >
                    <Table
                        data={rows}
                        columnsData={WorkOrderColumns}
                        newRowFunction={undefined}
                        setData={(newData) => handleTableDataChange(newData as WorkOrderTableRow[])}
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