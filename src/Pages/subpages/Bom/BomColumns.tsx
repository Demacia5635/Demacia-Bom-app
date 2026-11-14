import type { ColumnConfig } from "../../../components/Table";
import { downloadFile } from "../../../util/ApiService";
import type BomTableRow from "./BomTableRow";
import { isLockedBomRow } from "./BomTableRow";

const BomColumns: ColumnConfig[] = [
  { key: "avatar", label: "Avatar", type: "image", isDisabled: isLockedBomRow },
  { key: "name", label: "Name", type: "string", isDisabled: isLockedBomRow },
  { key: "description", label: "Description", type: "string", isDisabled: isLockedBomRow },
  { key: "catalogNumber", label: "Catalog No.", type: "string", isDisabled: isLockedBomRow },
  { key: "revision", label: "Revision", type: "string", isDisabled: isLockedBomRow },
  { key: "engineer", label: "Engineer", type: "string", isDisabled: isLockedBomRow },
  { key: "quantity", label: "Quantity", type: "number", isDisabled: () => true },
  { key: "material", label: "Material", type: "string", isDisabled: isLockedBomRow },
  { key: "mass", label: "Mass", type: "number", isDisabled: isLockedBomRow },
  { key: "price", label: "Price", type: "number", isDisabled: isLockedBomRow },
  { key: "comments", label: "Comments", type: "string", isDisabled: isLockedBomRow },
  
  // External Link Action (Sub-assemblies can open their Onshape document URL if available)
  {
    key: "onshapeURL",
    label: "Links",
    type: "button",
    buttonText: "Open Onshape",
    // Standard Content lives in Onshape's library, not in your documents: no link.
    isDisabled: (row: BomTableRow) => !!row.isStandardContent || (!row.onshapeURL && !row.documentID),
    onButtonClick: (row: BomTableRow) => {
      if (row.isStandardContent) return;
      let url = row.onshapeURL;
      if (!url && row.documentID && row.elementID) {
        url = `https://cad.onshape.com/documents/${row.documentID}/${row.wvmType || "w"}/${row.wvmID}/e/${row.elementID}`;
      }
      if (url) window.open(url, "_blank");
    },
  },
  // Export STL Action (Disabled and blocked for sub-assemblies)
  {
    key: "exportSTL",
    label: "Export STL",
    type: "button",
    buttonText: "Download",
    // Files are saved in Google Drive on publish; no Onshape fallback.
    isDisabled: (row: BomTableRow) => row.isSubAssembly || !row.exportSTL,
    onButtonClick: (row: BomTableRow) => {
      if (row.isSubAssembly || !row.exportSTL) return; // Hard block for sub-assemblies
      downloadFile(`${import.meta.env.VITE_CLIENT_URL}/api/drive/file/id/${row.exportSTL}`, `${row.name || "part"}.stl`);
    },
  },
  // Export Parasolid Action (Disabled and blocked for sub-assemblies)
  {
    key: "exportParasolid",
    label: "Export Parasolid",
    type: "button",
    buttonText: "Download",
    isDisabled: (row: BomTableRow) => row.isSubAssembly || !row.exportParasolid,
    onButtonClick: (row: BomTableRow) => {
      if (row.isSubAssembly || !row.exportParasolid) return; // Hard block for sub-assemblies
      downloadFile(`${import.meta.env.VITE_CLIENT_URL}/api/drive/file/id/${row.exportParasolid}`, `${row.name || "part"}.x_t`);
    },
  },
];

export default BomColumns;