import type BomTableRow from "../Pages/subpages/Bom/BomTableRow";

/**
 * Where a row's data actually came from:
 *  - "db"           : this Bom/Part exists in our database. Fully editable,
 *                      edits are saved back to both the DB and (best-effort)
 *                      Onshape's own metadata.
 *  - "onshape-only"  : this Bom/Part only exists in Onshape's assembly tree -
 *                      it has never been published. Read-only row; the user
 *                      is prompted to add it (either by publishing the whole
 *                      top-level assembly, or - for a sub-assembly nested
 *                      under an already-published parent - via its own
 *                      "Add to DB" action).
 */
export type BomRowSource = "db" | "onshape-only";

export default interface AssemblyBomRow extends BomTableRow {
  source: BomRowSource;
  /** True for rows that represent a sub-assembly (bom) rather than a part. */
  isAssembly: boolean;
  /**
   * Synthetic field powering the "Add to DB" button column: Table.tsx
   * enables type:'button' columns purely off truthiness of row[col.key], so
   * this is set to a truthy sentinel exactly when source is "onshape-only"
   * and left empty when the row is already saved in the DB.
   */
  dbAction: string;
  /** Onshape configuration of a part row (empty for the default); exports use it. */
  configuration?: string;
  /** Onshape Standard Content (screws, nuts, washers...): bought, not made, and not editable. */
  isStandardContent?: boolean;
  /**
   * Marked as a standard (bought) part in this extension: a bearing, motor...
   * Locked like Standard Content. A marked sub-assembly is one bought item:
   * its insides aren't loaded or published. Saved on Publish BOM.
   */
  markedStandard?: boolean;
  /**
   * Keys of editable cells whose value differs from `baseline`: what Publish
   * BOM would change. Edits stay local (and in the saved copy of the tree)
   * until Publish BOM, which writes them to Onshape and the database.
   */
  modified?: string[];
  /** Editable values as saved in the database, or as loaded when the item isn't saved yet. */
  baseline?: Record<string, string | number>;
  /** Editable values as loaded by the last Refresh BOM; cells changed from these are written to Onshape. */
  loaded?: Record<string, string | number>;
  /** Drive file IDs currently saved for this item, replaced (then deleted) by Publish BOM. */
  saved?: { avatarID?: string; stlLink?: string; parasolidLink?: string; filesModelVersion?: string };
  /**
   * The database record's updatedAt (ISO) when this row was loaded or last
   * published here; "" when it wasn't saved. Publish BOM stops if the record
   * changed since (someone else published it), instead of overwriting it.
   */
  dbUpdatedAt?: string;
  /**
   * Made parts: bounding box from Onshape, e.g. "25 × 8 × 8 mm" (util/partSize).
   * undefined until read (only while "Show size" is on, or on Publish BOM);
   * "" when Onshape couldn't give one. Not an edit: saved on Publish when known.
   */
  size?: string;
  /**
   * Set only when `size` came from the database: the model version it was
   * read at (the record's filesModelVersion, "" if unknown). A different
   * current version means the geometry changed, so the size is read again.
   * undefined for sizes just read from Onshape.
   */
  sizeVersion?: string;
  /**
   * A part combined from several items with the same catalog number (the user
   * chose "Combine", see copyRows.ts): the copies used under this row's
   * parent, each as it was loaded (own Onshape part, quantity). Not shown in
   * the table, published, counted or checked themselves: Publish BOM writes
   * edits to every copy.
   */
  copies?: AssemblyBomRow[];
  /** Parts: whether Publish BOM keeps an STL / Parasolid (unticking deletes it on publish). */
  wantStl?: boolean;
  wantParasolid?: boolean;
}
