import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchFromApi, type ApiError } from "../util/ApiService";
import { useThemeSync } from "../util/misc/useThemeSync";
import Table from "../components/Table";
import WorkOrderColumns from "./WorkOrderColumns";
import type WorkOrderTableRow from "./WorkOrderTableRow";
import type { BomModel, PartModel, WorkorderModel } from "../util/Models";
import WorkOrderDataUI from "./WorkOrderDataUI";

export default function WorkOrderDetailsPage() {
    const { workOrderID } = useParams<{ workOrderID: string }>();
    const { isLight, toggleTheme } = useThemeSync();

    const [rows, setRows] = useState<WorkOrderTableRow[]>([])
    const [error, setError] = useState<ApiError | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [workOrderData, setworkOrderData] = useState<WorkorderModel | null>(null);

    const parseStatusToString = (code: number | string | undefined): string => {
        if (code === 1 || code === '1' || code === 'Finished creation') return 'Finished creation';
        if (code === 2 || code === '2' || code === 'Given to assembly kit') return 'Given to assembly kit';
        return 'In creation';
    };

    useEffect(() => {
        async function getWOData() {
            if (!workOrderID) return;
            const data = await fetchFromApi<WorkorderModel>(`/db/workOrder/id/${workOrderID}`);
            setworkOrderData(data);
        }

        getWOData();
    }, [workOrderID])

    // Force-sync select element values and classes to the DOM so CSS rules catch them
    useEffect(() => {
        const syncSelectElements = () => {
            const selects = document.querySelectorAll(".cell-select");
            selects.forEach((el) => {
                const select = el as HTMLSelectElement;
                const val = select.value;
                
                // Set the attribute so CSS selectors can pick it up instantly
                select.setAttribute("value", val);

                // Clear old color classes
                select.classList.remove("status-bg-orange", "status-bg-blue", "status-bg-green", "status-bg-red");

                // Apply matching color class
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

            for (const [partID, totalQty] of aggregatedQuantities.entries()) {
                const part = await fetchFromApi<PartModel>(`/db/part/id/${partID}`);
                const existingWoPart = workOrderData?.parts?.find(p => p.partID === partID);

                const partRow: WorkOrderTableRow = {
                    id: `${workOrderID}-part-${partID}`,
                    parentId: null,
                    isExpanded: false,
                    avatar: part.avatarID ? `/drive/file/id/${part.avatarID}` : "",
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
                    vendor: (part as any).vendor || ""
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
                <WorkOrderDataUI workOrder={workOrderData} />
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
                <Table
                    data={rows}
                    columnsData={WorkOrderColumns}
                    newRowFunction={undefined}
                    setData={(newData) => { return setRows(newData as WorkOrderTableRow[]); }}
                />
            )}
        </div>
    )
}