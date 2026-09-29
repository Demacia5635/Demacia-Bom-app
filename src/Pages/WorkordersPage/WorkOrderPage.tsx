import { useState, useMemo, useEffect } from "react";
import { fetchFromApi } from "../../util/ApiService";
import { useThemeSync } from "../../util/misc/useThemeSync";
import WorkOrderTable from "./WorkOrderTable";
import type { WorkorderModel } from "../../util/Models";

// Define and EXPORT the WorkorderSummary type directly here
export type WorkorderSummary = Omit<
  WorkorderModel,
  "bomID" | "description" | "parts" | "comments" | "createdAt"
>;

export function WorkOrdersPage() {
    const { isLight, toggleTheme } = useThemeSync();
    const [searchQuery, setSearchQuery] = useState("");
    const [workOrders, setWorkOrders] = useState<WorkorderSummary[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function getWorkOrders() {
            setLoading(true);
            try {
                const response = await fetchFromApi<WorkorderSummary[]>(`/db/workOrder/all`).catch(
                    () => fetchFromApi<WorkorderSummary[]>(`/db/workorder/all`)
                );
                setWorkOrders(response || []);
            } catch (err: any) {
                console.error("Failed to fetch work orders:", err);
                setError(err?.message || "Failed to load work orders");
            } finally {
                setLoading(false);
            }
        }

        getWorkOrders();
    }, []);

    const filteredWorkOrders = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return workOrders;

        return workOrders.filter((wo) => {
            const nameMatch = wo.name?.toLowerCase().includes(query);
            const catalogMatch = wo.catalogNumber?.toLowerCase().includes(query);
            const bomMatch = wo.bomName?.toLowerCase().includes(query);
            const ownerMatch = wo.workOrderOwner?.toLowerCase().includes(query);

            return nameMatch || catalogMatch || bomMatch || ownerMatch;
        });
    }, [searchQuery, workOrders]);

    const pageBg = isLight ? "bg-zinc-50 text-zinc-900" : "bg-zinc-950 text-zinc-100";
    const cardBg = isLight ? "bg-white border-zinc-200" : "bg-zinc-900 border-zinc-800";
    const inputBg = isLight ? "bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400" : "bg-zinc-900 border-zinc-800 text-zinc-100 placeholder-zinc-500";
    const textHeading = isLight ? "text-zinc-900" : "text-white";
    const textMuted = isLight ? "text-zinc-500" : "text-zinc-400";
    const textSubdued = isLight ? "text-zinc-600" : "text-zinc-600";
    const textValue = isLight ? "text-zinc-800" : "text-zinc-200";

    return (
        <div className={`min-h-screen p-6 space-y-6 transition-colors duration-200 ${pageBg}`}>
            <div className="max-w-6xl mx-auto space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className={`text-2xl font-bold tracking-tight ${textHeading}`}>Work Orders</h1>
                        <p className={`text-xs ${textMuted}`}>Manage and search work orders by name, catalog #, BOM, or owner.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className={`text-xs ${textMuted} font-mono`}>
                            Results: <span className={`${textValue} font-bold`}>{filteredWorkOrders.length}</span>
                        </div>
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className={`px-3 py-1.5 rounded font-medium text-xs ${isLight ? "bg-zinc-200 hover:bg-zinc-300 text-zinc-800" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"}`}
                        >
                            {isLight ? "🌙 Dark Mode" : "☀️ Light Mode"}
                        </button>
                    </div>
                </div>

                <div className="relative">
                    <div className={`absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none ${textMuted}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by work order name, catalog #, BOM name, or owner..."
                        className={`w-full border rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-md ${inputBg}`}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className={`absolute inset-y-0 right-0 pr-3.5 flex items-center ${textMuted} hover:${textHeading} text-xs font-semibold`}
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="max-w-6xl mx-auto p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm">
                    <p className="font-semibold">Error Loading Work Orders</p>
                    <p>{error}</p>
                </div>
            )}

            <div className="max-w-6xl mx-auto">
                {loading ? (
                    <div className={`${cardBg} border rounded-xl p-12 text-center`}>
                        <p className={`${textMuted} text-sm font-medium`}>Loading work orders...</p>
                    </div>
                ) : filteredWorkOrders.length > 0 ? (
                    <WorkOrderTable workOrders={filteredWorkOrders} />
                ) : (
                    <div className={`${cardBg} border rounded-xl p-12 text-center space-y-2`}>
                        <p className={`${textMuted} text-sm font-medium`}>
                            {searchQuery ? `No work orders found matching "${searchQuery}"` : "No work orders available."}
                        </p>
                        <p className={`${textSubdued} text-xs`}>
                            Try searching with a different term or clearing filters.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default WorkOrdersPage;