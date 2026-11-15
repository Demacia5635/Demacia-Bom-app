import { useState, useMemo, useEffect } from "react";
import { AuthenticatedImage, fetchFromApi, type ApiError } from "../../util/ApiService";
import { useThemeSync } from "../../util/misc/useThemeSync";
import type { BomModel, PartModel } from "../../util/Models";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import PartPortal from "./PartPortal";
import { recordImageSrc } from "../../util/recordImage";
import { isMadeRecord, splitStandard } from "../../util/standardItems";

/** A search result: a part, or a sub-assembly (an assembly some other assembly uses). */
type SearchItem =
    | { kind: "part"; record: PartModel }
    | { kind: "subAssembly"; record: BomModel };

/**
 * Sub-assemblies: saved assemblies listed in another assembly's subAssemblies,
 * so an assembly shows up here as soon as it gets a parent. One saved as a
 * part (marked standard) is already in the parts list and isn't repeated.
 */
function subAssembliesOf(boms: BomModel[], parts: PartModel[]): BomModel[] {
    const usedAsSub = new Set<string>();
    for (const bom of boms) {
        for (const sub of bom.subAssemblies ?? []) {
            if (sub.bomID !== bom.id) usedAsSub.add(sub.bomID);
        }
    }
    const partIds = new Set(parts.map((p) => p.id));
    return boms.filter((bom) => usedAsSub.has(bom.id) && !partIds.has(bom.id));
}

/**
 * Search Parts lists what the team makes; with `standard` (the Standard Parts
 * page) it lists the bought items instead: standard parts and standard
 * sub-assemblies (util/standardItems.ts).
 */
export function PartsSearchPage({ standard = false }: { standard?: boolean }) {
    const { isLight } = useThemeSync();
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState("");
    const [items, setItems] = useState<SearchItem[]>([]);
    const [isOpen, setOpen] = useState<PartModel | null>(null);
    // Without these, a slow or failed load showed "Nothing found", as if the database were empty.
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<ApiError | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function getItems() {
            try {
                await loadItems();
            } catch (err) {
                // Only the parts list can fail here: a failed BOM list just means no sub-assemblies.
                if (!cancelled) setError(err as ApiError);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        async function loadItems() {
            const [parts, boms] = await Promise.all([
                fetchFromApi<PartModel[]>(`/db/part/all`),
                // Sub-assemblies are extra: if the assembly list fails, still show the parts.
                fetchFromApi<BomModel[]>(`/db/bom/all`).catch(() => [] as BomModel[]),
            ]);
            if (cancelled) return;
            const split = splitStandard(boms, parts);
            if (standard) {
                // A standard sub-assembly has a part record with its id too: listed once, as that part.
                const partIds = new Set(parts.map((p) => p.id));
                setItems([
                    ...parts.filter((p) => split.standardPartIds.has(p.id)).map((record): SearchItem => ({ kind: "part", record })),
                    ...boms
                        .filter((b) => split.standardBomIds.has(b.id) && !partIds.has(b.id))
                        .map((record): SearchItem => ({ kind: "subAssembly", record })),
                ]);
                return;
            }
            const made = (r: { id: string }) => isMadeRecord(split, r.id);
            setItems([
                ...parts.filter(made).map((record): SearchItem => ({ kind: "part", record })),
                ...subAssembliesOf(boms, parts).filter(made).map((record): SearchItem => ({ kind: "subAssembly", record })),
            ]);
        }

        getItems();
        return () => { cancelled = true; };
    }, [standard]);

    const filteredItems = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return items;

        return items.filter(({ record }) => {
            const nameMatch = record.name?.toLowerCase().includes(query);
            const catalogMatch = record.catalogNumber?.toLowerCase().includes(query);
            const descriptionMatch = record.description?.toLowerCase().includes(query);

            return nameMatch || catalogMatch || descriptionMatch;
        });
    }, [searchQuery, items]);

    // Theme Styles Mapping
    const pageBg = isLight ? "bg-zinc-50 text-zinc-900" : "bg-zinc-950 text-zinc-100";
    const cardBg = isLight ? "bg-white border-zinc-200 hover:border-zinc-300" : "bg-zinc-900 border-zinc-800 hover:border-zinc-700";
    const imageBg = isLight ? "bg-zinc-100 border-zinc-200" : "bg-zinc-950 border-zinc-800";
    const inputBg = isLight ? "bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400" : "bg-zinc-900 border-zinc-800 text-zinc-100 placeholder-zinc-500";
    const textHeading = isLight ? "text-zinc-900" : "text-white";
    const textMuted = isLight ? "text-zinc-500" : "text-zinc-400";
    const textSubdued = isLight ? "text-zinc-600" : "text-zinc-600";
    const textValue = isLight ? "text-zinc-800" : "text-zinc-200";

    return (
        <div className={`min-h-screen p-6 space-y-6 transition-colors duration-200 ${pageBg}`}>
            {/* Header & Search Bar */}
            <div className="max-w-6xl mx-auto space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className={`text-2xl font-bold tracking-tight ${textHeading}`}>{standard ? "Standard Parts" : "Parts Catalog"}</h1>
                        <p className={`text-xs ${textMuted}`}>
                            {standard
                                ? "Bought items saved by Publish BOM (Standard Content, vendor parts, items marked standard). Search by name, catalog number, or description."
                                : "Search parts and sub-assemblies by name, catalog number, or description. Standard parts are on the Standard Parts page."}
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className={`text-xs ${textMuted} font-mono`}>
                            Results: <span className={`${textValue} font-bold`}>{filteredItems.length}</span>
                        </div>
                        
                    </div>
                </div>

                {/* Search Input Box */}
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
                        placeholder="Search by name, catalog #, or description..."
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

            {/* Results Grid */}
            <div className="max-w-6xl mx-auto">
                {loading ? (
                    <div className={`${cardBg} border rounded-xl p-12 text-center`}>
                        <p className={`${textMuted} text-sm font-medium`}>Loading {standard ? "standard parts" : "parts"}...</p>
                    </div>
                ) : error ? (
                    <div className="p-4 bg-red-900/50 border border-red-500 rounded-xl text-red-200">
                        <p className="font-semibold">Error loading parts</p>
                        <p>{error.message}</p>
                        {error.statusCode && <p className="text-sm">HTTP Status Code: {error.statusCode}</p>}
                    </div>
                ) : items.length === 0 ? (
                    <div className={`${cardBg} border rounded-xl p-12 text-center`}>
                        <p className={`${textMuted} text-sm font-medium`}>
                            {standard ? "No standard parts have been published yet." : "No parts have been published yet."}
                        </p>
                    </div>
                ) : filteredItems.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredItems.map((item) => {
                            const part = item.record;
                            const isSub = item.kind === "subAssembly";
                            const imageSrc = recordImageSrc(part as any);

                            return (
                                <div
                                    key={`${item.kind}:${part.id}`}
                                    onClick={() => (item.kind === "part" ? setOpen(item.record) : navigate(`/bom/${part.id}`))}
                                    className={`${cardBg} border rounded-xl p-4 shadow-md transition-all cursor-pointer flex gap-4 items-start group`}
                                >
                                    {/* Thumbnail */}
                                    <div className={`w-16 h-16 shrink-0 ${imageBg} border rounded-lg overflow-hidden flex items-center justify-center`}>
                                        {imageSrc ? (
                                            <AuthenticatedImage
                                                src={imageSrc}
                                                alt={part.name || "Part Thumbnail"}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                            />
                                        ) : (
                                            <span className={`${textSubdued} text-[10px] font-mono`}>NO IMAGE</span>
                                        )}
                                    </div>

                                    {/* Part Metadata */}
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <h3 className={`text-sm font-semibold ${textHeading} truncate group-hover:text-blue-500 transition-colors`}>
                                                {part.name || part.id}
                                            </h3>
                                            {isSub && (
                                                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-blue-500/15 text-blue-500">
                                                    Sub-assembly
                                                </span>
                                            )}
                                        </div>

                                        <p className={`text-xs font-mono ${textMuted}`}>
                                            Cat #: <span className={textValue}>{part.catalogNumber || "N/A"}</span>
                                        </p>

                                        {part.description && (
                                            <p className={`text-xs ${textMuted} line-clamp-2 italic`}>
                                                {part.description}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className={`${cardBg} border rounded-xl p-12 text-center space-y-2`}>
                        <p className={`${textMuted} text-sm font-medium`}>Nothing found matching "{searchQuery}"</p>
                        <p className={`${textSubdued} text-xs`}>Try searching with a different term or clearing filters.</p>
                    </div>
                )}
            </div>
            {isOpen && createPortal(
                <div
                    onClick={() => setOpen(null)}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                >
                    <div onClick={(e) => e.stopPropagation()}>
                        <PartPortal part={isOpen}/>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

export default PartsSearchPage;