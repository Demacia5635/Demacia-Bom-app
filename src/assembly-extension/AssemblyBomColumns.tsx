import type { ColumnConfig } from "../components/Table";
import { downloadFile } from "../util/ApiService";
import type AssemblyBomRow from "./AssemblyBomRow";

/** Standard Content (bolts, nuts...) comes from Onshape's library and isn't editable. */
const isStandardContent = (row: AssemblyBomRow) => row.vendor !== "";

/** Editable column: disabled for Standard Content, marked while it has an unpublished change. */
function editable(key: string, label: string, type: "string" | "number"): ColumnConfig {
  return {
    key,
    label,
    type,
    isDisabled: isStandardContent,
    isModified: (row: AssemblyBomRow) => !!row.modified?.includes(key),
  };
}

/**
 * Columns of the BOM table in the Chrome extension. Edits stay in the browser
 * until Publish BOM. NOTE: for `type: 'button'` columns, Table.tsx enables the
 * button from the truthiness of `row[col.key]` itself.
 */
export default function buildAssemblyBomColumns(): ColumnConfig[] {
  return [
    { key: "avatar", label: "Avatar", type: "image", isDisabled: isStandardContent },
    editable("name", "Name", "string"),
    editable("description", "Description", "string"),
    editable("catalogNumber", "Catalog No.", "string"),
    editable("revision", "Revision", "string"),
    editable("engineer", "Engineer", "string"),
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
        if (row.onshapeURL) window.open(row.onshapeURL, "_blank");
      },
    },
    {
      key: "exportSTL",
      label: "Export STL",
      type: "button",
      buttonText: "Download",
      isDisabled: isStandardContent,
      onButtonClick: (row: AssemblyBomRow) => {
        if (row.exportSTL) {
          downloadFile(`${import.meta.env.VITE_CLIENT_URL}/api/drive/file/id/${row.exportSTL}`, `${row.name || "part"}.stl`);
        }
      },
    },
    {
      key: "exportParasolid",
      label: "Export Parasolid",
      type: "button",
      buttonText: "Download",
      isDisabled: isStandardContent,
      onButtonClick: (row: AssemblyBomRow) => {
        if (row.exportParasolid) {
          downloadFile(`${import.meta.env.VITE_CLIENT_URL}/api/drive/file/id/${row.exportParasolid}`, `${row.name || "part"}.x_t`);
        }
      },
    },
  ];
}
