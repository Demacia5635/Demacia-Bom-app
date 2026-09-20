import { useEffect, useState, useRef, type MouseEvent } from "react";
import { useParams } from "react-router-dom";
import { fetchFromApi, type ApiError } from "../util/ApiService";
import { useThemeSync } from "../util/misc/useThemeSync";
import Table from "../components/Table";
import WorkOrderColumns from "./WorkOrderColumns";
import type WorkOrderTableRow from "./WorkOrderTableRow";
import type { BomModel, PartModel, WorkorderModel } from "../util/Models";
import WorkOrderDataUI from "./WorkOrderDataUI";
import PartPortal from "../searchParts/PartPortal";

export default function WorkOrderDetailsPage() {
    const { workOrderID } = useParams<{ workOrderID: string }>();
    const { isLight, toggleTheme } = useThemeSync();

    const [rows, setRows] = useState<WorkOrderTableRow[]>([]);
    const [error, setError] = useState<ApiError | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [workOrderData, setworkOrderData] = useState<WorkorderModel | null>(null);
    const [assemblyThumbnailUrl, setAssemblyThumbnailUrl] = useState<string>("");

    // States for the PartPortal modal popup & custom context menu
    const [selectedPart, setSelectedPart] = useState<PartModel | null>(null);
    const [isPartPortalOpen, setIsPartPortalOpen] = useState<boolean>(false);
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        row: WorkOrderTableRow;
    } | null>(null);

    // Map to keep track of partID per row id
    const rowPartMapRef = useRef<Map<string, string>>(new Map());

    const parseStatusToString = (code: number | string | undefined): string => {
        if (code === 1 || code === '1' || code === 'Finished creation') return 'Finished creation';
        if (code === 2 || code === '2' || code === 'Given to assembly kit') return 'Given to assembly kit';
        return 'In creation';
    };

    useEffect(() => {
        const handleClickOutside = () => setContextMenu(null);
        window.addEventListener("click", handleClickOutside);
        return () => window.removeEventListener("click", handleClickOutside);
    }, []);

    useEffect(() => {
        async function getWOData() {
            if (!workOrderID) return;
            const data = await fetchFromApi<WorkorderModel>(`/db/workOrder/id/${workOrderID}`);
            setworkOrderData(data);

            // If workOrder directly holds an onshapeID, construct thumbnail URL immediately
            if ((data as any)?.onshapeID?.documentID && (data as any)?.onshapeID?.elementID) {
                const { documentID, wvmType = "w", wvmID, elementID } = (data as any).onshapeID;
                setAssemblyThumbnailUrl(`/api/onshape/bom/d/${documentID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elementID}/thumbnail`);
            }
        }

        getWOData();
    }, [workOrderID]);

    // Force-sync select element values and classes to the DOM so CSS rules catch them
    useEffect(() => {
        const syncSelectElements = () => {
            const selects = document.querySelectorAll(".cell-select");
            selects.forEach((el) => {
                const select = el as HTMLSelectElement;
                const val = select.value;
                
                select.setAttribute("value", val);
                select.classList.remove("status-bg-orange", "status-bg-blue", "status-bg-green", "status-bg-red");

                if (["In creation", "Medium", "Manual"].includes(val)) {
                    select.classList.add("status-bg-orange");
                } else if (["Finished creation", "Milled", "Lathed", "CNC"].includes(val)) {
                    select.classList.add("status-bg-blue");
                } else if (["Given to assembly kit", "Low"].includes(val)) {
                    select.classList.add("status-bg-green");
                } else if (val === "High") {
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
        if (!workOrderID || !workOrderData || !workOrderData.bomID) return;

        async function fetchBomPartsRecursively(
            targetBomId: string,
            multiplier: number = 1,
            accMap: Map<string, number> = new Map()
        ): Promise<Map<string, number>> {
            const currentBom = await fetchFromApi<BomModel>(`/db/bom/id/${targetBomId}`);

            // If this is the root BOM, generate the assembly thumbnail URL from its onshapeID
            if (targetBomId === workOrderData?.bomID && currentBom?.onshapeID) {
                const { documentID, wvmType = "w", wvmID, elementID } = currentBom.onshapeID;
                if (documentID && elementID) {
                    setAssemblyThumbnailUrl(`/api/onshape/bom/d/${documentID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elementID}/thumbnail`);
                }
            }

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
                const part = await fetchFromApi<PartModel>(`/db/part/id/${partID}`);
                const existingWoPart = workOrderData?.parts?.find(p => p.partID === partID);

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
                    productionMakingOwner: existingWoPart?.productionMakingOwner || "",
                    catalogNumber: part.catalogNumber || "",
                    name: part.name || "",
                    quantityTotal: totalQty,
                    statusCode: parseStatusToString(existingWoPart?.statusCode),
                    approxArrivalDate: (existingWoPart as any)?.approxArrivalDate || "",
                    manufacturingMethod: (existingWoPart as any)?.manufacturingMethod || (part as any)?.manufacturingMethod || "Manual",
                    importance: (existingWoPart as any)?.importance || "Medium",
                    comments: (existingWoPart as any)?.comments || (part as any)?.comments || "",
                    onshapeURL: part.onshapeURL || "",
                    exportSTL: part.stlLink || "",
                    exportParasolid: part.parasolidLink || "",
                    vendor: part.vendor || ""
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

    const handleTableContextMenuCapture = (e: MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const rowEl = target.closest(".table-tr, tr, .table-td, td");
        if (!rowEl) return;

        e.preventDefault();
        e.stopPropagation();

        const tbody = rowEl.closest("tbody") || rowEl.parentElement;
        if (!tbody) return;

        const trs = Array.from(tbody.querySelectorAll(".table-tr, tr"));
        let rowIndex = -1;
        const matchedTr = rowEl.closest(".table-tr, tr");
        if (matchedTr) {
            rowIndex = trs.indexOf(matchedTr);
        }

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
                <button
                    type="button"
                    onClick={toggleTheme}
                    className={`px-3 py-2 rounded font-medium text-sm ${isLight ? "bg-zinc-200 hover:bg-zinc-300 text-zinc-800" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"}`}
                >
                    {isLight ? "🌙 Dark Mode" : "☀️ Light Mode"}
                </button>
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
                <div onContextMenuCapture={handleTableContextMenuCapture} className="relative">
                    <Table
                        data={rows}
                        columnsData={WorkOrderColumns}
                        newRowFunction={undefined}
                        setData={(newData) => { return setRows(newData as WorkOrderTableRow[]); }}
                    />

                    {/* Custom Context Menu */}
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

            {/* PartPortal Modal Popup Overlay */}
            {isPartPortalOpen && selectedPart && (
                <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
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
        </div>
    );
}