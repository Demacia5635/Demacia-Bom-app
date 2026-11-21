import type { usePanelThemeSetting } from "../extension/panel/theme";

/**
 * The top of the panel: the assembly's name, description and status notes,
 * the theme switch, and the Refresh BOM / Publish BOM buttons.
 */
export default function BomHeader({
  displayName,
  description,
  rootIsPublished,
  topProblem,
  topNumber,
  theme,
  busy,
  loading,
  publishing,
  hasRows,
  pendingEditCount,
  onRefresh,
  onPublish,
}: {
  displayName: string;
  description: string | undefined;
  rootIsPublished: boolean;
  /** Why the top assembly's catalog number would stop a work order, if it would. */
  topProblem: string | undefined;
  topNumber: string;
  theme: ReturnType<typeof usePanelThemeSetting>;
  /** Loading, publishing or loading a sub-tree: both buttons are off. */
  busy: boolean;
  loading: boolean;
  publishing: boolean;
  hasRows: boolean;
  pendingEditCount: number;
  onRefresh: () => void;
  onPublish: () => void;
}) {
  return (
    <div className="assembly-bom-header flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-zinc-200 dark:border-zinc-800 pb-4">
      <div>
        <h1 className="assembly-bom-title text-2xl font-bold">{displayName}</h1>
        {description && (
          <p className="assembly-bom-subtitle text-zinc-500 text-sm mt-1">{description}</p>
        )}
        {!rootIsPublished && (
          <p className="assembly-bom-unpublished-hint text-xs text-blue-500 mt-1 italic">
            This assembly isn't in the database yet - it's showing live Onshape data.
          </p>
        )}
        {topProblem && (
          <p className="assembly-bom-top-problem text-xs mt-1" title="Set the top assembly's catalog number in Onshape (Part number) or in the Publish BOM form">
            ⚠ {topNumber ? `Catalog number ${topNumber}: ` : ""}{topProblem}
          </p>
        )}
      </div>

      <div className="flex items-center gap-4">
        {theme && (
          // Same as the website's switch (components/Appbar.tsx).
          <button
            type="button"
            onClick={theme.toggle}
            aria-label="Toggle Theme"
            title={theme.isLight ? "Switch to dark mode" : "Switch to light mode"}
            className={`p-1.5 rounded-md text-sm transition-colors ${
              theme.isLight ? "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100" : "text-gray-300 hover:text-white hover:bg-gray-800"
            }`}
          >
            {theme.isLight ? "🌙" : "☀️"}
          </button>
        )}
        <button
          type="button"
          className="publish-btn-primary shadow-md"
          onClick={onRefresh}
          disabled={busy}
          title="Reload everything from Onshape (the database only for fields Onshape doesn't have). Saves nothing; discards edits not published yet."
        >
          {loading ? "Refreshing..." : "Refresh BOM"}
        </button>

        <button
          type="button"
          className="publish-btn-primary shadow-md"
          onClick={onPublish}
          disabled={busy || !hasRows}
          title="Save everything shown to the database, replacing the saved data and files, and write edited cells to Onshape"
        >
          {publishing ? "Publishing..." : pendingEditCount > 0 ? `Publish BOM (${pendingEditCount} changes)` : "Publish BOM"}
        </button>
      </div>
    </div>
  );
}
