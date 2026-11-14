import type { ColumnConfig } from "../../../components/Table";
import { downloadFile } from "../../../util/ApiService";
import type BomTableRow from "./BomTableRow";

const BomColumns: ColumnConfig[] = [
  { key: "avatar", label: "Avatar", type: "image", isDisabled: (row) => row.vendor !== "" },
  { key: "name", label: "Name", type: "string", isDisabled: (row) => row.vendor !== "" },
  { key: "description", label: "Description", type: "string", isDisabled: (row) => row.vendor !== "" },
  { key: "catalogNumber", label: "Catalog No.", type: "string", isDisabled: (row) => row.vendor !== "" },
  { key: "revision", label: "Revision", type: "string", isDisabled: (row) => row.vendor !== "" },
  { key: "engineer", label: "Engineer", type: "string", isDisabled: (row) => row.vendor !== "" },
  { key: "quantity", label: "Quantity", type: "number", isDisabled: () => true },
  { key: "material", label: "Material", type: "string", isDisabled: (row) => row.vendor !== "" },
  { key: "mass", label: "Mass", type: "number", isDisabled: (row) => row.vendor !== "" },
  { key: "price", label: "Price", type: "number", isDisabled: (row) => row.vendor !== "" },
  { key: "comments", label: "Comments", type: "string", isDisabled: (row) => row.vendor !== "" },
  
  // External Link Action (Sub-assemblies can open their Onshape document URL if available)
  {
    key: "onshapeURL",
    label: "Links",
    type: "button",
    buttonText: "Open Onshape",
    isDisabled: (row: BomTableRow) => !row.onshapeURL && !row.documentID,
    onButtonClick: (row: BomTableRow) => {
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