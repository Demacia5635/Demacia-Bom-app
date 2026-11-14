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
  /** Parts: whether Publish BOM keeps an STL / Parasolid (unticking deletes it on publish). */
  wantStl?: boolean;
  wantParasolid?: boolean;
}
