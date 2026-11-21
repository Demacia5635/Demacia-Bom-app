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
import { hasUnfinishedParts, loadWorkOrderSummaries, type WorkOrderSummary } from "./workOrderSummary";

type SortOrder = "oldest" | "newest" | "name";
const SORT_KEY = "workOrders:sort";
function readSort(): SortOrder {
    try {
        const saved = localStorage.getItem(SORT_KEY);
        return saved === "newest" || saved === "name" ? saved : "oldest";
    } catch {
        return "oldest";
    }
}


export function WorkOrdersPage() {
    const theme = useThemeClasses();
    const [searchQuery, setSearchQuery] = useState("");
    const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    // Progress per work order (QW14), from the server's summary; null when it has none.
    const [summaries, setSummaries] = useState<Map<string, WorkOrderSummary> | null>(null);
    const [ownerFilter, setOwnerFilter] = useState("");
    const [unfinishedOnly, setUnfinishedOnly] = useState(false);
    const [sortOrder, setSortOrder] = useState<SortOrder>(readSort);
    useEffect(() => {
        try { localStorage.setItem(SORT_KEY, sortOrder); } catch { /* not remembered */ }
    }, [sortOrder]);
    useEffect(() => {
        let cancelled = false;
        loadWorkOrderSummaries().then((found) => { if (!cancelled) setSummaries(found); });
        return () => { cancelled = true; };
    }, []);

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

    const owners = useMemo(
        () => [...new Set(workOrders.map((wo) => wo.workOrderOwner?.trim()).filter((o): o is string => !!o))].sort((a, b) => a.localeCompare(b)),
        [workOrders]
    );

    const filteredWorkOrders = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        const shown = workOrders.filter((wo) => {
            if (ownerFilter && wo.workOrderOwner?.trim() !== ownerFilter) return false;
            if (unfinishedOnly && summaries && !hasUnfinishedParts(summaries.get(wo.id))) return false;
            if (!query) return true;
            const nameMatch = wo.name?.toLowerCase().includes(query);
            const catalogMatch = wo.catalogNumber?.toLowerCase().includes(query);
            const bomMatch = wo.bomName?.toLowerCase().includes(query);
            const ownerMatch = wo.workOrderOwner?.toLowerCase().includes(query);
            return nameMatch || catalogMatch || bomMatch || ownerMatch;
        });
        // The list arrives oldest first.
        if (sortOrder === "newest") return [...shown].reverse();
        if (sortOrder === "name") return [...shown].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        return shown;
    }, [searchQuery, workOrders, ownerFilter, unfinishedOnly, summaries, sortOrder]);

    // Written out in full: Tailwind only generates classes it finds as literal text.
    const textSubdued = "text-zinc-600"; // the same in both themes

    return (
        <div className={`min-h-screen p-4 sm:p-6 space-y-6 transition-colors duration-200 ${theme.page}`}>
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

                {/* Owner, unfinished and sort (QW14). */}
                <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 text-xs ${theme.textLabel}`}>
                    <label className="flex items-center gap-2">
                        Owner
                        <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className={`border rounded-lg px-2 py-1 ${theme.input}`}>
                            <option value="">All owners</option>
                            {owners.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </label>
                    {summaries && (
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={unfinishedOnly} onChange={(e) => setUnfinishedOnly(e.target.checked)} />
                            Only with unfinished parts
                        </label>
                    )}
                    <label className="flex items-center gap-2 sm:ml-auto">
                        Sort
                        <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as SortOrder)} className={`border rounded-lg px-2 py-1 ${theme.input}`}>
                            <option value="oldest">Oldest first</option>
                            <option value="newest">Newest first</option>
                            <option value="name">Name (A–Z)</option>
                        </select>
                    </label>
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
                    <WorkOrderTable workOrders={filteredWorkOrders} summaries={summaries} />
                ) : (
                    <div className={`${theme.card} border rounded-xl p-12 text-center space-y-2`}>
                        <p className={`${theme.textMuted} text-sm font-medium`}>
                            {searchQuery || ownerFilter || unfinishedOnly ? "No work orders match the search and filters." : "No work orders available."}
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