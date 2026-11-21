import { useState, useMemo, useEffect } from "react";
import { fetchFromApi } from "../../util/ApiService";
import WorkOrderTable from "./WorkOrderTable";
import type { WorkOrderRow } from "../../util/Models";
import { fetchBomsByIds } from "../../util/records";
import { recordImageSrc } from "../../util/recordImage";
import ErrorBanner from "../../components/ErrorBanner";
import { useThemeClasses } from "../../util/misc/useThemeClasses";
import { useSearchShortcut } from "../../components/useSearchShortcut";
import { SkeletonList } from "../../components/Skeleton";


export function WorkOrdersPage() {
    const theme = useThemeClasses();
    const [searchQuery, setSearchQuery] = useState("");
    const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function getWorkOrders() {
            setLoading(true);
            try {
                const response = await fetchFromApi<WorkOrderRow[]>(`/db/workOrder/all`);
                // Oldest first, by when each was made. The server sorts by id, which was
                // the creation time until new ids became random (crypto.randomUUID).
                const createdTime = (wo: WorkOrderRow) =>
                    Date.parse(String(wo.createdAt ?? "")) || Number(wo.id) || 0;
                const list = [...(response || [])].sort((a, b) => createdTime(a) - createdTime(b));
                setWorkOrders(list);

                // Each work order is made from an assembly: show that assembly's
                // image, name and catalog number (one request for all of them).
                const bomIds = list.map((wo) => wo.bomID || "").filter(Boolean);
                const boms = await fetchBomsByIds(bomIds).catch(() => null);
                if (boms && boms.size > 0) {
                    setWorkOrders(list.map((wo) => {
                        const bom = boms.get(wo.bomID || "");
                        if (!bom) return wo;
                        const bomImage = recordImageSrc(bom);
                        return {
                            ...wo,
                            bomName: wo.bomName || bom.name,
                            catalogNumber: wo.catalogNumber || bom.catalogNumber,
                            // The assembly's current picture; the work order's own only as a fallback.
                            ...(bomImage ? { avatarID: bomImage, driveFileId: undefined, thumbnailURL: undefined } : {}),
                        } as WorkOrderRow;
                    }));
                }
            } catch (err: any) {
                console.error("Failed to fetch work orders:", err);
                setError(err?.message || "Failed to load work orders");
            } finally {
                setLoading(false);
            }
        }

        getWorkOrders();
    }, []);

    // "/" jumps to the search box, Esc clears it.
    const { inputRef: searchInputRef, onKeyDown: onSearchKeyDown } = useSearchShortcut(() => setSearchQuery(""));

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

    // Written out in full: Tailwind only generates classes it finds as literal text.
    const textSubdued = "text-zinc-600"; // the same in both themes

    return (
        <div className={`min-h-screen p-6 space-y-6 transition-colors duration-200 ${theme.page}`}>
            <div className="max-w-6xl mx-auto space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className={`text-2xl font-bold tracking-tight ${theme.textHeading}`}>Work Orders</h1>
                        <p className={`text-xs ${theme.textMuted}`}>Manage and search work orders by name, catalog #, BOM, or owner.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className={`text-xs ${theme.textMuted} font-mono`}>
                            Results: <span className={`${theme.textValue} font-bold`}>{filteredWorkOrders.length}</span>
                        </div>
                        
                    </div>
                </div>

                <div className="relative">
                    <div className={`absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none ${theme.textMuted}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={onSearchKeyDown}
                        aria-label="Search work orders"
                        aria-keyshortcuts="/"
                        placeholder="Search by work order name, catalog #, BOM name, or owner…   ( / )"
                        className={`w-full border rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-md ${theme.input}`}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className={`absolute inset-y-0 right-0 pr-3.5 flex items-center ${theme.textMuted} ${theme.hoverHeading} text-xs font-semibold`}
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <ErrorBanner title="Error Loading Work Orders" className="max-w-6xl mx-auto p-4 rounded-lg text-sm">
                    <p>{error}</p>
                </ErrorBanner>
            )}

            <div className="max-w-6xl mx-auto">
                {loading ? (
                    <SkeletonList label="Loading work orders…" />
                ) : filteredWorkOrders.length > 0 ? (
                    <WorkOrderTable workOrders={filteredWorkOrders} />
                ) : (
                    <div className={`${theme.card} border rounded-xl p-12 text-center space-y-2`}>
                        <p className={`${theme.textMuted} text-sm font-medium`}>
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