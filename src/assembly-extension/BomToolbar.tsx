import { goToProblemCell } from "./problemNavigation";
import { SEARCH_INPUT_ID, SHORTCUTS } from "./shortcuts";

/**
 * The row of controls above the BOM table: search, the work-order problems
 * button, Expand / Collapse all, and the view toggles.
 */
export default function BomToolbar({
  search,
  setSearch,
  searching,
  searchMatchCount,
  problemCount,
  problemsOnly,
  onToggleProblemsOnly,
  hasRows,
  subtreeLoads,
  setAllExpanded,
  hideStandardParts,
  setHideStandardParts,
  standardPartCount,
  hideStandardAssemblies,
  setHideStandardAssemblies,
  standardAssemblyCount,
  showSize,
  setShowSize,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  search: string;
  setSearch: (value: string) => void;
  /** A search is active (Expand / Collapse all are off meanwhile). */
  searching: boolean;
  searchMatchCount: number;
  problemCount: number;
  problemsOnly: boolean;
  onToggleProblemsOnly: () => void;
  hasRows: boolean;
  /** Sub-assemblies whose insides are loading after their standard mark was removed. */
  subtreeLoads: number;
  setAllExpanded: (expanded: boolean) => void;
  hideStandardParts: boolean;
  setHideStandardParts: (on: boolean) => void;
  standardPartCount: number;
  hideStandardAssemblies: boolean;
  setHideStandardAssemblies: (on: boolean) => void;
  standardAssemblyCount: number;
  showSize: boolean;
  setShowSize: (on: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="assembly-bom-toolbar mb-2 flex flex-wrap items-center gap-2">
      <div className="bom-search">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSearch("");
          }}
          id={SEARCH_INPUT_ID}
          placeholder="Search name, catalog #, description..."
          aria-label="Search the BOM"
          title={`Search the BOM (${SHORTCUTS.search}); Esc clears it`}
        />
      </div>
      <button
        type="button"
        className="bom-toolbar-btn"
        onClick={onUndo}
        disabled={!canUndo}
        title={`Undo the last edit (${SHORTCUTS.undo})`}
        aria-label="Undo"
      >
        ↶
      </button>
      <button
        type="button"
        className="bom-toolbar-btn"
        onClick={onRedo}
        disabled={!canRedo}
        title={`Redo (${SHORTCUTS.redo})`}
        aria-label="Redo"
      >
        ↷
      </button>
      {problemCount > 0 ? (
        <>
          <button
            type="button"
            className={`bom-toolbar-btn bom-problems-btn ${problemsOnly ? "bom-problems-btn-active" : ""}`}
            onClick={() => onToggleProblemsOnly()}
            aria-pressed={problemsOnly}
            title={
              problemsOnly
                ? "Showing only parts that would stop a work order. Click to show everything."
                : "Items with values that would stop a work order (catalog number that fits its assembly and is unique, material, engineer). " +
                  "Marked in red; hover a cell for details. Click to show only those parts."
            }
          >
            ⚠ {problemCount} problem{problemCount === 1 ? "" : "s"}
          </button>
          <button
            type="button"
            className="bom-toolbar-btn"
            onClick={() => goToProblemCell(-1, document.querySelector(".assembly-bom-page") ?? document)}
            title="Previous problem: scroll to the red cell before this one"
            aria-label="Previous problem"
          >
            ‹
          </button>
          <button
            type="button"
            className="bom-toolbar-btn"
            onClick={() => goToProblemCell(1, document.querySelector(".assembly-bom-page") ?? document)}
            title="Next problem: scroll to the next red cell"
            aria-label="Next problem"
          >
            ›
          </button>
        </>
      ) : (
        hasRows && (
          <span className="bom-toolbar-note" title="Every made item has a valid, unique catalog number that fits its assembly, and every made part a material and an engineer">
            ✓ Ready for a work order
          </span>
        )
      )}
      {subtreeLoads > 0 && (
        <span className="bom-toolbar-note">Loading the parts of the assembly you unmarked…</span>
      )}
      {searching && (
        <span className="bom-toolbar-note">
          {searchMatchCount} match{searchMatchCount === 1 ? "" : "es"}
        </span>
      )}
      <button
        type="button"
        className="bom-toolbar-btn"
        onClick={() => setAllExpanded(true)}
        disabled={searching}
        title={searching ? "Clear the search first" : "Show every sub-assembly's contents"}
      >
        Expand all
      </button>
      <button
        type="button"
        className="bom-toolbar-btn"
        onClick={() => setAllExpanded(false)}
        disabled={searching}
        title={searching ? "Clear the search first" : "Show only the top level"}
      >
        Collapse all
      </button>
      <label className="bom-toolbar-toggle" title="Onshape Standard Content (screws, nuts...) and parts marked as standard parts">
        <input
          type="checkbox"
          checked={hideStandardParts}
          onChange={(e) => setHideStandardParts(e.target.checked)}
        />
        Hide standard parts ({standardPartCount})
      </label>
      <label className="bom-toolbar-toggle" title="Sub-assemblies marked as standard parts (motors...)">
        <input
          type="checkbox"
          checked={hideStandardAssemblies}
          onChange={(e) => setHideStandardAssemblies(e.target.checked)}
        />
        Hide standard assemblies ({standardAssemblyCount})
      </label>
      <label
        className="bom-toolbar-toggle"
        title="Each made part's size in Onshape (bounding box, longest side first), e.g. a spacer's length. Read from Onshape while this is on."
      >
        <input type="checkbox" checked={showSize} onChange={(e) => setShowSize(e.target.checked)} />
        Show size
      </label>
    </div>
  );
}
