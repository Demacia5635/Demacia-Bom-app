import type { ColumnConfig } from "../../../components/Table";
import { cadLinkColumn, fileDownloadColumns } from "../partColumns";
import type BomTableRow from "./BomTableRow";
import { isReadOnlyBomRow } from "./BomTableRow";

const BomColumns: ColumnConfig[] = [
  { key: "avatar", label: "Avatar", type: "image", isDisabled: isReadOnlyBomRow },
  { key: "name", label: "Name", type: "string", isDisabled: isReadOnlyBomRow },
  // Shown by the "Show size" checkbox (BomDetailsPage); saved by Publish BOM.
  { key: "size", label: "Size", type: "string", isDisabled: () => true },
  { key: "description", label: "Description", type: "string", isDisabled: isReadOnlyBomRow },
  { key: "catalogNumber", label: "Catalog No.", type: "string", isDisabled: isReadOnlyBomRow },
  { key: "revision", label: "Revision", type: "string", isDisabled: isReadOnlyBomRow },
  { key: "engineer", label: "Engineer", type: "string", isDisabled: isReadOnlyBomRow },
  { key: "quantity", label: "Quantity", type: "number", isDisabled: () => true },
  { key: "material", label: "Material", type: "string", isDisabled: isReadOnlyBomRow },
  { key: "mass", label: "Mass", type: "number", isDisabled: isReadOnlyBomRow },
  { key: "price", label: "Price", type: "number", isDisabled: isReadOnlyBomRow },
  { key: "comments", label: "Comments", type: "string", isDisabled: isReadOnlyBomRow },
  
  // Standard Content lives in Onshape's library, not in your documents, and items
  // marked standard are bought: no link (as in the extension). Without a saved
  // URL, the link needs the document, workspace/version and element IDs.
  cadLinkColumn<BomTableRow>({
    label: "Links",
    buttonText: "Open Onshape",
    url: (row) => {
      if (row.isStandardContent || row.markedStandard) return undefined;
      if (row.onshapeURL) return row.onshapeURL;
      if (row.documentID && row.wvmID && row.elementID) {
        return `https://cad.onshape.com/documents/${row.documentID}/${row.wvmType || "w"}/${row.wvmID}/e/${row.elementID}`;
      }
      return undefined;
    },
  }),
  // Sub-assemblies have no files of their own.
  ...fileDownloadColumns<BomTableRow>((row) => !!row.isSubAssembly),
];

export default BomColumns;