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
    isDisabled: (row: BomTableRow) => row.isSubAssembly || (!row.exportSTL && !row.documentID),
    onButtonClick: (row: BomTableRow) => {
      if (row.isSubAssembly) return; // Hard block for sub-assemblies
      let downloadUrl = "";
      if (row.exportSTL) {
        downloadUrl = `${import.meta.env.VITE_CLIENT_URL}/api/drive/file/id/${row.exportSTL}`;
      } else if (row.documentID && row.elementID) {
        downloadUrl = `${import.meta.env.VITE_CLIENT_URL}/api/onshape/part/d/${row.documentID}/wvmT/${row.wvmType || "w"}/wvmI/${row.wvmID || ""}/e/${row.elementID}/p/${row.entityID}/stl`;
      }
      if (downloadUrl) {
        downloadFile(downloadUrl, `${row.name || "part"}.stl`);
      }
    },
  },
  // Export Parasolid Action (Disabled and blocked for sub-assemblies)
  {
    key: "exportParasolid",
    label: "Export Parasolid",
    type: "button",
    buttonText: "Download",
    isDisabled: (row: BomTableRow) => row.isSubAssembly || (!row.exportParasolid && !row.documentID),
    onButtonClick: (row: BomTableRow) => {
      if (row.isSubAssembly) return; // Hard block for sub-assemblies
      let downloadUrl = "";
      if (row.exportParasolid) {
        downloadUrl = `${import.meta.env.VITE_CLIENT_URL}/api/drive/file/id/${row.exportParasolid}`;
      } else if (row.documentID && row.elementID) {
        downloadUrl = `${import.meta.env.VITE_CLIENT_URL}/api/onshape/part/d/${row.documentID}/wvmT/${row.wvmType || "w"}/wvmI/${row.wvmID || ""}/e/${row.elementID}/p/${row.entityID}/parasolid`;
      }
      if (downloadUrl) {
        downloadFile(downloadUrl, `${row.name || "part"}.parasolid`);
      }
    },
  },
];

export default BomColumns;