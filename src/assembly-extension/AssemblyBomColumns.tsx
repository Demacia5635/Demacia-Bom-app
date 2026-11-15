import type { ColumnConfig } from "../components/Table";
import type AssemblyBomRow from "./AssemblyBomRow";
import { openExternal } from "../util/openExternal";

/**
 * Not editable: Standard Content (bolts, nuts...) and vendor parts, which come
 * from outside, and parts marked standard here (bought, locked like screws).
 */
const isStandardContent = (row: AssemblyBomRow) => row.vendor !== "" || !!row.isStandardContent || !!row.markedStandard;

/** Why a cell's value would stop a work order, if it would. */
export type CellProblem = (row: AssemblyBomRow, key: string) => string | undefined;

/**
 * Columns of the BOM table in the Chrome extension. Edits stay in the browser
 * until Publish BOM. NOTE: for `type: 'button'` columns, Table.tsx enables the
 * button from the truthiness of `row[col.key]` itself.
 * `cellProblem` marks values that would stop a work order (read on every render).
 * `defaultEngineer` is shown greyed in an empty engineer cell: what Publish BOM
 * writes there.
 */
export default function buildAssemblyBomColumns(cellProblem?: CellProblem, defaultEngineer = ""): ColumnConfig[] {
  /** Editable column: disabled for Standard Content, marked while it has an unpublished change. */
  const editable = (key: string, label: string, type: "string" | "number"): ColumnConfig => ({
    key,
    label,
    type,
    isDisabled: isStandardContent,
    isModified: (row: AssemblyBomRow) => !!row.modified?.includes(key),
    problem: cellProblem ? (row: AssemblyBomRow) => cellProblem(row, key) : undefined,
  });

  return [
    { key: "avatar", label: "Avatar", type: "image", isDisabled: isStandardContent },
    editable("name", "Name", "string"),
    editable("description", "Description", "string"),
    editable("catalogNumber", "Catalog No.", "string"),
    editable("revision", "Revision", "string"),
    {
      ...editable("engineer", "Engineer", "string"),
      placeholder: (row: AssemblyBomRow) => (isStandardContent(row) ? undefined : defaultEngineer || undefined),
    },
    // Must stay read-only: Table writes an edit to every row with the same id,
    // and rows of an item used in several places share an id but each has its
    // own quantity (how many under that parent).
    { key: "quantity", label: "Quantity", type: "number", isDisabled: () => true },
    editable("material", "Material", "string"),
    // Mass is computed by Onshape from geometry + material - never user-settable.
    { key: "mass", label: "Mass", type: "number", isDisabled: () => true },
    editable("price", "Price", "number"),
    editable("comments", "Comments", "string"),
    {
      key: "onshapeURL",
      label: "Links",
      type: "button",
      buttonText: "Open Onshape",
      isDisabled: isStandardContent,
      onButtonClick: (row: AssemblyBomRow) => {
        openExternal(row.onshapeURL);
      },
    },
    // Which files Publish BOM keeps for each part (unticking deletes the file on
    // publish). Defaults come from the material. Downloads are on the website.
    {
      key: "wantStl",
      label: "STL",
      type: "boolean",
      isDisabled: (row: AssemblyBomRow) => row.isAssembly || isStandardContent(row),
      isModified: (row: AssemblyBomRow) => !!row.modified?.includes("wantStl"),
    },
    {
      key: "wantParasolid",
      label: "Parasolid",
      type: "boolean",
      isDisabled: (row: AssemblyBomRow) => row.isAssembly || isStandardContent(row),
      isModified: (row: AssemblyBomRow) => !!row.modified?.includes("wantParasolid"),
    },
    // Bought rather than made (a bearing, a motor...): locked like Standard
    // Content, no files; a sub-assembly becomes one item (its insides drop out).
    // Saved on Publish BOM. Onshape Standard Content already is; vendor parts and
    // sub-assemblies are always marked (ticked, locked).
    {
      key: "markedStandard",
      label: "Standard part",
      type: "boolean",
      isDisabled: (row: AssemblyBomRow) => row.vendor !== "" || !!row.isStandardContent,
      isModified: (row: AssemblyBomRow) => !!row.modified?.includes("markedStandard"),
    },
  ];
}
