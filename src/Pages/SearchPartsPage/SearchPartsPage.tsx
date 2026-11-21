import { useState, useMemo, useEffect } from "react";
import { fetchFromApi, type ApiError } from "../../util/ApiService";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import { useThemeSync } from "../../util/misc/useThemeSync";
import type { BomModel, PartModel } from "../../util/Models";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import PartPortal from "./PartPortal";
import RecordDialog from "../../components/RecordDialog";
import { recordImageSrc } from "../../util/recordImage";
import { isMadeRecord, splitStandard } from "../../util/standardItems";
import ErrorBanner, { ApiErrorText } from "../../components/ErrorBanner";
import { useThemeClasses } from "../../util/misc/useThemeClasses";
import { matchesSearch, searchPattern } from "../../util/search";
import Highlight from "../../components/Highlight";
import { useSearchShortcut } from "../../components/useSearchShortcut";
import { usePartInAddress } from "../../components/usePartInAddress";
import CopyButton from "../../components/CopyButton";
import { SkeletonCards } from "../../components/Skeleton";

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
    const theme = useThemeClasses();
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState("");
    const [items, setItems] = useState<SearchItem[]>([]);
    /** The part shown in Part Portal (null: closed). */
    const [openPart, setOpenPart] = useState<PartModel | null>(null);
    // ?part=<id> opens that part, and the address follows Part Portal (shareable link).
    usePartInAddress(openPart, setOpenPart);
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

    // Name, catalog #, description, material, engineer and vendor; case and
    // extra spaces don't matter (util/search.ts). The matches are highlighted.
    const pattern = useMemo(() => searchPattern(searchQuery), [searchQuery]);
    const filteredItems = useMemo(() => {
        if (!pattern) return items;
        return items.filter(({ record }) => {
            const part = record as PartModel & BomModel;
            return matchesSearch(pattern, [part.name, part.catalogNumber, part.description, part.material, part.engineer, part.vendor]);
        });
    }, [pattern, items]);
    // "/" jumps to the search box, Esc clears it.
    const { inputRef: searchInputRef, onKeyDown: onSearchKeyDown } = useSearchShortcut(() => setSearchQuery(""));

    // Theme Styles Mapping
    const cardBg = isLight ? "bg-white border-zinc-200 hover:border-zinc-300" : "bg-zinc-900 border-zinc-800 hover:border-zinc-700";
    // Written out in full: Tailwind only generates classes it finds as literal text.
    const textSubdued = "text-zinc-600"; // the same in both themes

    return (
        <div className={`min-h-screen p-4 sm:p-6 space-y-6 transition-colors duration-200 ${theme.page}`}>
            {/* Header & Search Bar */}
            <div className="max-w-6xl mx-auto space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className={`text-2xl font-bold tracking-tight ${theme.textHeading}`}>{standard ? "Standard Parts" : "Parts Catalog"}</h1>
                        <p className={`text-xs ${theme.textMuted}`}>
                            {standard
                                ? "Bought items saved by Publish BOM (Standard Content, vendor parts, items marked standard). Search by name, catalog number, or description."
                                : "Search parts and sub-assemblies by name, catalog number, or description. Standard parts are on the Standard Parts page."}
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className={`text-xs ${theme.textMuted} font-mono`}>
                            Results: <span className={`${theme.textValue} font-bold`}>{filteredItems.length}</span>
                        </div>
                        
                    </div>
                </div>

                {/* Search Input Box */}
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
                        aria-label="Search parts"
                        aria-keyshortcuts="/"
                        placeholder="Search name, catalog #, description, material, engineer, vendor…   ( / )"
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

            {/* Results Grid */}
            <div className="max-w-6xl mx-auto">
                {loading ? (
                    <SkeletonCards label={standard ? "Loading standard parts…" : "Loading parts…"} />
                ) : error ? (
                    <ErrorBanner title="Error loading parts" className="p-4 rounded-xl">
                        <ApiErrorText error={error} />
                    </ErrorBanner>
                ) : items.length === 0 ? (
                    <div className={`${cardBg} border rounded-xl p-12 text-center`}>
                        <p className={`${theme.textMuted} text-sm font-medium`}>
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
                                    onClick={() => (item.kind === "part" ? setOpenPart(item.record) : navigate(`/bom/${part.id}`))}
                                    className={`${cardBg} border rounded-xl p-4 shadow-md transition-all cursor-pointer flex gap-4 items-start group`}
                                >
                                    {/* Thumbnail */}
                                    <div className={`w-16 h-16 shrink-0 ${theme.imageBox} border rounded-lg overflow-hidden flex items-center justify-center`}>
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
                                            <h3 className={`text-sm font-semibold ${theme.textHeading} truncate group-hover:text-blue-500 transition-colors`}>
                                                <Highlight text={part.name || part.id} pattern={pattern} />
                                            </h3>
                                            {isSub && (
                                                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-blue-500/15 text-blue-500">
                                                    Sub-assembly
                                                </span>
                                            )}
                                        </div>

                                        <p className={`text-xs font-mono ${theme.textMuted}`}>
                                            Cat #: <span className={theme.textValue}><Highlight text={part.catalogNumber || "N/A"} pattern={pattern} /></span>
                                            {part.catalogNumber && <CopyButton text={part.catalogNumber} what="catalog number" />}
                                        </p>

                                        {part.description && (
                                            <p className={`text-xs ${theme.textMuted} line-clamp-2 italic`}>
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
                        <p className={`${theme.textMuted} text-sm font-medium`}>Nothing found matching "{searchQuery}"</p>
                        <p className={`${textSubdued} text-xs`}>Try searching with a different term or clearing filters.</p>
                    </div>
                )}
            </div>
            {openPart && createPortal(
                // Close button, Esc and a tap outside close it (RecordDialog).
                <RecordDialog onClose={() => setOpenPart(null)}>
                    <PartPortal
                        key={openPart.id}
                        part={openPart}
                        onSaved={(saved) => setItems((list) => list.map((item) =>
                            item.kind === "part" && item.record.id === saved.id ? { ...item, record: saved } : item
                        ))}
                    />
                </RecordDialog>,
                document.body
            )}
        </div>
    );
}

export default PartsSearchPage;