import { useEffect, useMemo, useState } from "react";
import { fetchFromApi, type ApiError } from "../../util/ApiService";
import { useThemeSync } from "../../util/misc/useThemeSync";
import BomTable from "./BomTable";
import type { BomModel, PartModel } from "../../util/Models";
import { isMadeRecord, splitStandard } from "../../util/standardItems";
import ErrorBanner, { ApiErrorText } from "../../components/ErrorBanner";
import { useThemeClasses } from "../../util/misc/useThemeClasses";
import { matchesSearch, searchPattern } from "../../util/search";
import { useSearchShortcut } from "../../components/useSearchShortcut";

export type BomSummary = Omit<BomModel, 'description' | 'comments' | 'onshapeURL' | 'onshapeID' | 'parts' | 'subAssemblies' | 'createdAt'>;

export default function BomsPage() {
  const { isLight } = useThemeSync();

  const [boms, setBoms] = useState<BomSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);
  const theme = useThemeClasses();

  // Search by name or catalog # ("/" jumps to it, Esc clears it). Matching
  // sub-assemblies show too, under their parent when it matches as well.
  const [searchQuery, setSearchQuery] = useState("");
  const { inputRef: searchInputRef, onKeyDown: onSearchKeyDown } = useSearchShortcut(() => setSearchQuery(""));

  useEffect(() => {
    Promise.all([
      fetchFromApi<BomModel[]>("/db/bom/all"),
      // Only to recognise standard sub-assemblies by their part record; the
      // BOMs' own marks still work if this fails.
      fetchFromApi<PartModel[]>("/db/part/all").catch(() => [] as PartModel[]),
    ])
      .then(([data, parts]) => {
        // Standard (bought) sub-assemblies and their insides are on the Standard Parts page.
        const split = splitStandard(data, parts);
        const sorted = data
          .filter((bom) => isMadeRecord(split, bom.id))
          .sort((a, b) => {
            const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return timeB - timeA;
          });
        setBoms(sorted);
      })
      .catch((err: ApiError) => setError(err))
      .finally(() => setLoading(false));
  }, []);

  const textHeading = isLight ? "text-zinc-900" : "text-zinc-100";
  const pattern = useMemo(() => searchPattern(searchQuery), [searchQuery]);
  const shownBoms = useMemo(
    () => (pattern ? boms.filter((bom) => matchesSearch(pattern, [bom.name, bom.catalogNumber])) : boms),
    [boms, pattern]
  );

  if (loading) {
    return <div className={`p-8 text-center min-h-screen transition-colors duration-200 ${isLight ? "bg-zinc-50 text-zinc-500" : "bg-zinc-950 text-zinc-400"}`}>Loading BOMs...</div>;
  }

  return (
    <div className={`p-8 max-w-7xl mx-auto min-h-screen transition-colors duration-200 ${isLight ? "bg-zinc-50" : "bg-zinc-950 text-zinc-100"}`}>
      <div className="flex justify-between items-center mb-6">
        <h1 className={`text-2xl font-bold ${textHeading}`}>Boms</h1>
      </div>

      <div className="relative mb-6">
        <div className={`absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none ${theme.textMuted}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={onSearchKeyDown}
          aria-label="Search BOMs"
          aria-keyshortcuts="/"
          placeholder="Search by name or catalog #…   ( / )"
          className={`w-full border rounded-xl pl-10 pr-16 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-md ${theme.input}`}
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

      {error && (
        <ErrorBanner title="Error Loading BOMs" className="mb-6 p-4 rounded-lg">
          <ApiErrorText error={error} />
        </ErrorBanner>
      )}

      {/* After a failed load the error says why; an empty table would only add "no BOMs". */}
      {!error && <BomTable boms={shownBoms} emptyText={pattern ? `No BOMs match "${searchQuery.trim()}"` : undefined} />}
    </div>
  );
}