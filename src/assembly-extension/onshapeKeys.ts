/**
 * How an Onshape tab (document, workspace/version/microversion, element) is
 * turned into keys and IDs. One place, so a cache key, a cycle check and a
 * database record ID for the same tab always agree.
 */
import type { OnshapeKey } from "./BomApi";
import type { OnshapeBomTable, ParsedOnshapeBomRow } from "./OnshapeBom";

type KeyFields = Pick<OnshapeKey, "documentID" | "wvmType" | "wvmID" | "elementID">;

/** The tab of a row or anything else carrying the four key fields. */
export const keyOf = (k: KeyFields): OnshapeKey => ({
  documentID: k.documentID,
  wvmType: k.wvmType,
  wvmID: k.wvmID,
  elementID: k.elementID,
});

/** The tab a BOM line (part or sub-assembly) comes from. */
export const itemKey = (item: ParsedOnshapeBomRow): OnshapeKey => ({
  documentID: item.itemSource.documentId,
  wvmType: item.itemSource.wvmType,
  wvmID: item.itemSource.wvmId,
  elementID: item.itemSource.elementId,
});

/** "doc/w/wvm/elem": request caches and the saved-copy key. */
export const keyString = (k: KeyFields): string => `${k.documentID}/${k.wvmType}/${k.wvmID}/${k.elementID}`;

/** "doc_w_wvm_elem": identifies an assembly in the tree walk (visited / cycle checks). */
export const assemblyKeyId = (k: KeyFields): string => `${k.documentID}_${k.wvmType}_${k.wvmID}_${k.elementID}`;

/**
 * A row's ID, which is also its database record ID: the tab plus the part ID
 * (parts) or the BOM ID (assemblies, see bomIdOf).
 */
export const recordId = (k: KeyFields, entityID: string): string => `${assemblyKeyId(k)}_${entityID}`;

/**
 * The BOM ID used in record and row IDs: Onshape's BOM table ID, or the
 * element ID when Onshape gives none. Use it everywhere so they all agree.
 */
export function bomIdOf(bom: Pick<OnshapeBomTable, "id"> | null | undefined, key: Pick<OnshapeKey, "elementID">): string {
  return bom?.id || key.elementID;
}
