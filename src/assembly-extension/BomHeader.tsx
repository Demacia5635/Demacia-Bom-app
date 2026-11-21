import type { usePanelThemeSetting } from "../extension/panel/theme";
import { openExternal } from "../util/openExternal";
import { describeAge } from "./treeCache";
import { useNow } from "./useNow";
import { SHORTCUTS } from "./shortcuts";
import ServerStatusDot from "./ServerStatusDot";
import type { ServerStatus } from "./useServerStatus";

/**
 * The top of the panel: the assembly's name, description and status notes,
 * the theme switch, and the Refresh BOM / Publish BOM buttons.
 */
export default function BomHeader({
  displayName,
  description,
  rootIsPublished,
  websiteUrl,
  loadedAt,
  onshapeChanged,
  serverStatus,
  onCheckServer,
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
  onShowShortcuts,
}: {
  displayName: string;
  description: string | undefined;
  rootIsPublished: boolean;
  /** The assembly's page on the website, once it is saved there. */
  websiteUrl: string | null;
  /** When the tree on screen was read from Onshape; null while loading. */
  loadedAt: number | null;
  /** The assembly changed in Onshape since it was loaded. */
  onshapeChanged: boolean;
  serverStatus: ServerStatus;
  onCheckServer: () => void;
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
  onShowShortcuts: () => void;
}) {
  const now = useNow(30_000);
  return (
    <div className="assembly-bom-header flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-zinc-200 dark:border-zinc-800 pb-4">
      <div>
        <h1 className="assembly-bom-title text-2xl font-bold">
          {displayName}
          <ServerStatusDot status={serverStatus} onCheck={onCheckServer} />
        </h1>
        {description && (
          <p className="assembly-bom-subtitle text-zinc-500 text-sm mt-1">{description}</p>
        )}
        {loadedAt !== null && (
          <p className="assembly-bom-loaded-at text-xs text-zinc-500 mt-1" title={new Date(loadedAt).toLocaleString()}>
            Loaded from Onshape {describeAge(loadedAt, now)}
          </p>
        )}
        {onshapeChanged && (
          <p className="assembly-bom-onshape-changed text-xs mt-1 text-amber-400" role="status">
            ⟳ Onshape changed since this was loaded.{" "}
            <button
              type="button"
              className="underline hover:no-underline"
              onClick={onRefresh}
              disabled={busy}
              title={`Reload from Onshape (${SHORTCUTS.refresh})`}
            >
              Refresh BOM
            </button>
          </p>
        )}
        {!rootIsPublished && (
          <p className="assembly-bom-unpublished-hint text-xs text-blue-500 mt-1 italic">
            This assembly isn't in the database yet - it's showing live Onshape data.
          </p>
        )}
        {websiteUrl && (
          <p className="text-xs mt-1">
            <a
              href={websiteUrl}
              className="assembly-bom-website-link text-blue-500 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                openExternal(websiteUrl);
              }}
              title="This assembly's BOM page on the team website (new tab)"
            >
              Open on the website ↗
            </a>
          </p>
        )}
        {topProblem && (
          <p className="assembly-bom-top-problem text-xs mt-1" title="Set the top assembly's catalog number in Onshape (Part number) or in the Publish BOM form">
            ⚠ {topNumber ? `Catalog number ${topNumber}: ` : ""}{topProblem}
          </p>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onShowShortcuts}
          aria-label="Keyboard shortcuts"
          title={`Keyboard shortcuts (${SHORTCUTS.help})`}
          className="p-1.5 rounded-md text-sm text-zinc-400 hover:text-zinc-100"
        >
          ?
        </button>
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
          title={`Reload everything from Onshape (the database only for fields Onshape doesn't have). Saves nothing; discards edits not published yet. (${SHORTCUTS.refresh})`}
        >
          {loading ? "Refreshing..." : "Refresh BOM"}
        </button>

        <button
          type="button"
          className="publish-btn-primary shadow-md"
          onClick={onPublish}
          disabled={busy || !hasRows}
          title={`Save everything shown to the database, replacing the saved data and files, and write edited cells to Onshape (${SHORTCUTS.publish})`}
        >
          {publishing ? "Publishing..." : pendingEditCount > 0 ? `Publish BOM (${pendingEditCount} changes)` : "Publish BOM"}
        </button>
      </div>
    </div>
  );
}
