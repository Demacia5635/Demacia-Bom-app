import type { RowData } from "../../../components/Table";
import { isPurchasedPart } from "../../../util/Models";

export default interface BomTableRow extends RowData {
  avatar: string;
  name: string;
  catalogNumber: string;
  revision: string;
  description: string;
  engineer: string;
  material: string;
  mass: number;
  /** Bounding box from Onshape, e.g. "25 × 8 × 8 mm" (util/partSize); "" when unknown. */
  size?: string;
  price: number;
  quantity: number;
  comments: string;
  documentID: string;
  wvmType: string;
  wvmID: string;
  elementID: string;
  entityID: string;
  onshapeURL: string;
  exportSTL: string;
  exportParasolid: string;
  vendor: string;
  /** Onshape Standard Content (screws, nuts...): bought, so its details aren't editable. */
  isStandardContent?: boolean;
  /** Marked standard (bought) in the extension: locked like Standard Content. */
  markedStandard?: boolean;
  isSubAssembly?: boolean;
  subBomId?: string;
}

/**
 * Cells that can't be edited on the BOM page: bought items (isPurchasedPart:
 * Standard Content, vendor parts, items marked standard, as in the extension)
 * and sub-assemblies, whose details are edited in the BOM extension.
 */
export function isReadOnlyBomRow(row: BomTableRow): boolean {
  return !!row.isSubAssembly || isPurchasedPart(row);
}
