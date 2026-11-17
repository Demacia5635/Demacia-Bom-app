import type { RowData } from "../../../components/Table";

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
  isSubAssembly?: boolean;
  subBomId?: string;
}

/** Standard Content and vendor parts aren't edited here (same rule as the BOM extension). */
export function isLockedBomRow(row: BomTableRow): boolean {
  return row.vendor !== "" || !!row.isStandardContent;
}
