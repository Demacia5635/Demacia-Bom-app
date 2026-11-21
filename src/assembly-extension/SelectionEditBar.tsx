import { useState } from "react";

/** The cells the bar can set on every selected row. */
export type BulkField = "material" | "engineer" | "wantStl" | "wantParasolid";

/**
 * At the bottom of the panel while the selection covers several rows: sets Material,
 * Engineer, or the STL / Parasolid ticks on all of them at once. Bought
 * (locked) rows are skipped; material and files apply to parts only.
 */
export default function SelectionEditBar({
  rowCount,
  editableCount,
  disabled,
  onSet,
}: {
  rowCount: number;
  /** Selected rows that aren't locked (bought / vendor / Standard Content). */
  editableCount: number;
  /** While loading or publishing. */
  disabled: boolean;
  onSet: (field: BulkField, value: string | boolean) => void;
}) {
  const [material, setMaterial] = useState("");
  const [engineer, setEngineer] = useState("");
  const off = disabled || editableCount === 0;
  const textField = (label: string, field: "material" | "engineer", value: string, set: (v: string) => void) => (
    <label className="bom-toolbar-toggle">
      {label}
      <input
        type="text"
        value={value}
        onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !off) onSet(field, value);
        }}
        disabled={off}
        className="w-28 rounded border border-zinc-700 bg-transparent px-1.5 py-0.5"
        placeholder={label}
      />
      <button type="button" className="bom-toolbar-btn" disabled={off} onClick={() => onSet(field, value)} title={`Set ${label} on the selected rows (Enter)`}>
        Set
      </button>
    </label>
  );
  const tickField = (label: string, field: "wantStl" | "wantParasolid") => (
    <span className="bom-toolbar-toggle">
      {label}
      <button type="button" className="bom-toolbar-btn" disabled={off} onClick={() => onSet(field, true)} title={`Tick ${label} on the selected parts`}>
        ✓
      </button>
      <button type="button" className="bom-toolbar-btn" disabled={off} onClick={() => onSet(field, false)} title={`Untick ${label} on the selected parts`}>
        ✗
      </button>
    </span>
  );
  return (
    <div
      // Floats at the bottom of the panel, so it doesn't move the table while you select.
      className="assembly-bom-selection-bar fixed bottom-6 left-2 right-2 z-30 flex flex-wrap items-center gap-2 rounded-lg border border-blue-500/60 bg-zinc-900/95 px-3 py-2 text-xs shadow-lg"
      role="toolbar"
      aria-label="Edit the selected rows"
      // Clicking here keeps the table's selection (useCellSelection).
      data-keep-cell-selection
    >
      <strong>
        {rowCount} rows selected{editableCount < rowCount ? ` (${editableCount} editable)` : ""}
      </strong>
      {textField("Material", "material", material, setMaterial)}
      {textField("Engineer", "engineer", engineer, setEngineer)}
      {tickField("STL", "wantStl")}
      {tickField("Parasolid", "wantParasolid")}
    </div>
  );
}
