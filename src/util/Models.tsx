interface OnshapeID {
  documentID: string;
  wvmType: string;
  wvmID: string;
  elementID: string;
}

export interface BomModel {
  id: string;
  name?: string;
  description?: string;
  catalogNumber?: string;
  engineer?: string;
  comments?: string;
  onshapeURL?: string;
  avatarID?: string;
  onshapeID?: OnshapeID & { bomID: string};
  parts: { partID: string; quantity: number }[];
  subAssemblies: { bomID: string; quantity: number }[];
  vendor?: string;
  /** Model version the saved thumbnail was rendered from. */
  filesModelVersion?: string;
  /** Marked as a standard (bought) part in the extension: its insides aren't used. */
  markedStandard?: boolean;
  updatedAt?: Date;
  createdAt?: Date;
}

export interface PartModel {
  id: string;
  name?: string;
  catalogNumber?: string;
  revision?: string;
  description?: string;
  engineer?: string;
  material?: string;
  mass?: number;
  /** Bounding box in Onshape, longest side first, e.g. "25 × 8 × 8 mm" (util/partSize). */
  size?: string;
  price?: number;
  comments?: string;
  onshapeURL?: string;
  avatarID?: string;
  stlLink?: string;
  parasolidLink?: string;
  onshapeID?: OnshapeID & { partID: string};
  vendor?: string;
  /** Onshape Standard Content (screws, nuts, washers...): bought, not made. */
  isStandardContent?: boolean;
  /**
   * Marked as a standard (bought) part in the extension (a bearing, a motor...);
   * saved with isStandardContent true as well. Also set on the part record a
   * marked sub-assembly is saved as.
   */
  markedStandard?: boolean;
  /** Whether Publish BOM keeps an STL / Parasolid for this part (absent on older records). */
  wantStl?: boolean;
  wantParasolid?: boolean;
  /** Model version the saved thumbnail/STL/Parasolid were made from. */
  filesModelVersion?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Bought rather than made: has a vendor, is Onshape Standard Content, or was
 * marked standard in the extension (older records may have only that mark).
 */
export function isPurchasedPart(
  part: Pick<PartModel, "vendor" | "isStandardContent" | "markedStandard"> | null | undefined
): boolean {
  return Boolean(part?.isStandardContent || part?.markedStandard || (part?.vendor && part.vendor.trim() !== ""));
}

export interface WorkorderPartModel {
  partID: string;
  quantityTotal?: number;
  quantityMade?: number;
  /** A number (older work orders) or a status name such as "In Planning" / "Untracked". */
  statusCode?: number | string;
  /** e.g. "Manual", "CNC", "Purchased". */
  manufacturingMethod?: string;
  productionGCOwner?: string;
  productionMakingOwner?: string;
  updatedAt?: Date;
  createdAt?: Date;
}

export interface WorkorderModel {
  id: string;
  name?: string;
  bomID?: string;
  bomName?: string;
  catalogNumber?: string;
  workOrderOwner?: string;
  description?: string;
  parts?: WorkorderPartModel[];
  /** Parts cut together in one CNC run, sharing one G-code link (WorkOrder/cncGroups.ts). */
  cncGroups?: { id: string; partIDs: string[]; links?: string }[];
  avatarID?: string;
  thumbnailURL?: string;
  onshapeID?: OnshapeID & { workOrderID?: string; assemblyID?: string };
  comments?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
