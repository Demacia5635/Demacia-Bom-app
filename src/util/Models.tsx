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
  /** Whether Publish BOM keeps an STL / Parasolid for this part (absent on older records). */
  wantStl?: boolean;
  wantParasolid?: boolean;
  /** Model version the saved thumbnail/STL/Parasolid were made from. */
  filesModelVersion?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Bought rather than made: has a vendor, or is Onshape Standard Content. */
export function isPurchasedPart(part: Pick<PartModel, "vendor" | "isStandardContent"> | null | undefined): boolean {
  return Boolean(part?.isStandardContent || (part?.vendor && part.vendor.trim() !== ""));
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
  avatarID?: string;
  thumbnailURL?: string;
  onshapeID?: OnshapeID & { workOrderID?: string; assemblyID?: string };
  comments?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
