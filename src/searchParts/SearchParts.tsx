import { useState, useMemo, useEffect } from "react";
import { AuthenticatedImage, fetchFromApi } from "../util/ApiService";
import { useThemeSync } from "../util/misc/useThemeSync";
import type { PartModel } from "../util/Models";
import { createPortal } from "react-dom";
import PartPortal from "./PartPortal";

export function PartsSearchPage() {
    const { isLight, toggleTheme } = useThemeSync();
    const [searchQuery, setSearchQuery] = useState("");
    const [parts, setParts] = useState<PartModel[]>([]);
    const [isOpen, setOpen] = useState<PartModel | null>(null);

    useEffect(() => {
        if(parts.length !== 0) return;

        async function getParts() {
            const response = await fetchFromApi<PartModel[]>(`/db/part/all`);
            setParts(response);
        }

        getParts();
    }, [parts.length]);

    const filteredParts = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return parts;

        return parts.filter((part) => {
            const nameMatch = part.name?.toLowerCase().includes(query);
            const catalogMatch = part.catalogNumber?.toLowerCase().includes(query);
            const descriptionMatch = part.description?.toLowerCase().includes(query);

            return nameMatch || catalogMatch || descriptionMatch;
        });
    }, [searchQuery, parts]);

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
            {/* Header & Search Bar Bar */}
            <div className="max-w-6xl mx-auto space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className={`text-2xl font-bold tracking-tight ${textHeading}`}>Parts Catalog</h1>
                        <p className={`text-xs ${textMuted}`}>Search parts by name, catalog number, or description.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className={`text-xs ${textMuted} font-mono`}>
                            Results: <span className={`${textValue} font-bold`}>{filteredParts.length}</span>
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
                {filteredParts.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredParts.map((part) => (
                            <div
                                key={part.id}
                                onClick={() => setOpen(part)}
                                className={`${cardBg} border rounded-xl p-4 shadow-md transition-all cursor-pointer flex gap-4 items-start group`}
                            >
                                {/* Thumbnail */}
                                <div className={`w-16 h-16 shrink-0 ${imageBg} border rounded-lg overflow-hidden flex items-center justify-center`}>
                                    {part.avatarID ? (
                                        <AuthenticatedImage
                                            src={`/drive/file/id/${part.avatarID}`}
                                            alt={part.name}
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
                                            {part.name}
                                        </h3>
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
                        ))}
                    </div>
                ) : (
                    <div className={`${cardBg} border rounded-xl p-12 text-center space-y-2`}>
                        <p className={`${textMuted} text-sm font-medium`}>No parts found matching "{searchQuery}"</p>
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