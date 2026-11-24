/**
 * Rules for the panel's BOM rows: which cells are editable and how edits are
 * tracked against what was loaded or saved, which rows are bought (standard,
 * vendor) or locked, and the material -> files defaults.
 */
import type AssemblyBomRow from "./AssemblyBomRow";
import { CATALOG_NUMBER_FORMAT } from "../util/catalogNumbers";

/** Cells the user may edit (saved to the database on Publish BOM). */
export const EDITABLE_FIELDS = [
  "name",
  "description",
  "catalogNumber",
  "engineer",
  "material",
  "price",
  "comments",
  "wantStl",
  "wantParasolid",
  "markedStandard",
];

/** The table's column name for each editable cell (for lists of changes). */
export const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  description: "Description",
  catalogNumber: "Catalog No.",
  engineer: "Engineer",
  material: "Material",
  price: "Price",
  comments: "Comments",
  wantStl: "STL",
  wantParasolid: "Parasolid",
  markedStandard: "Standard part",
};

/** An edited cell's value as shown in a list of changes. */
export function describeFieldValue(field: string, value: unknown): string {
  if (BOOLEAN_FIELDS.has(field)) return value ? "yes" : "no";
  const text = String(value ?? "").trim();
  return text === "" ? "(empty)" : text;
}

/** Edited cells that are also written back to Onshape (the rest live only in the database). */
export const DATABASE_ONLY_FIELDS = new Set(["material", "wantStl", "wantParasolid", "markedStandard"]);

/** Checkbox cells: compared as true/false. */
const BOOLEAN_FIELDS = new Set(["wantStl", "wantParasolid", "markedStandard"]);

/**
 * Which files a material calls for: 3D-printing plastics -> STL; aluminum and
 * polycarbonate (cut from sheet on the CNC) -> Parasolid; acetal/Delrin/POM ->
 * neither. Null for a material with no rule.
 */
export function fileRuleForMaterial(material: string): { wantStl: boolean; wantParasolid: boolean } | null {
  const m = material.toLowerCase();
  if (/\b(delrin|acetal|pom|polyoxymethylene)\b/.test(m)) return { wantStl: false, wantParasolid: false };
  // Printing plastics first, so a printing blend like "PC-ABS" stays STL.
  if (/\b(pla\+?|abs|tpu|petg|pet-g|asa|nylon|pa\s?\d*|onyx|resin|tpe|hips)\b/.test(m)) {
    return { wantStl: true, wantParasolid: false };
  }
  if (/\b(polycarbonate|lexan|pc)\b/.test(m)) return { wantStl: false, wantParasolid: true };
  if (/\b(alumin(i)?um|al\s?\d{4}|\d{4}-t\d+)\b/.test(m)) return { wantStl: false, wantParasolid: true };
  return null;
}

/** Which files a part not chosen yet should get, from its material (no rule -> neither). */
export function fileDefaultsForMaterial(material: string): { wantStl: boolean; wantParasolid: boolean } {
  return fileRuleForMaterial(material) ?? { wantStl: false, wantParasolid: false };
}

export type FieldValues = Record<string, string | number>;

/** The editable cells of a row. */
export function editableValues(row: AssemblyBomRow): FieldValues {
  const r = row as unknown as Record<string, unknown>;
  return Object.fromEntries(EDITABLE_FIELDS.map((k) => [k, (r[k] ?? "") as string | number]));
}

/** Equal for display purposes: trimmed text; for price, 0 and empty are the same. */
function sameValue(field: string, a: unknown, b: unknown): boolean {
  if (field === "price") return (Number(a) || 0) === (Number(b) || 0);
  if (BOOLEAN_FIELDS.has(field)) return Boolean(a) === Boolean(b);
  return String(a ?? "").trim() === String(b ?? "").trim();
}

/** Engineer written for Onshape Standard Content (screws, nuts, washers...) and parts marked standard. */
export const STANDARD_PART_ENGINEER = "Standard Part";

/** Standard Content and vendor parts come from outside Onshape documents you own: never editable. */
export function isExternalRow(row: AssemblyBomRow): boolean {
  return row.vendor !== "" || !!row.isStandardContent;
}

/** Bought, not made: Onshape Standard Content, or marked as a standard part here. */
export function isStandardRow(row: AssemblyBomRow): boolean {
  return !!row.isStandardContent || !!row.markedStandard;
}

/**
 * What "Hide standard parts" hides (and counts): every bought part the table
 * greys out - Standard Content, vendor parts (e.g. screws or bearings from a
 * vendor library, which aren't Onshape Standard Content) and parts marked
 * standard. Same rule as the greyed-out cells in AssemblyBomColumns.
 * isStandardRow stays narrower: Publish uses it for files and the engineer.
 */
export function isHiddenByStandardToggle(row: AssemblyBomRow): boolean {
  return isStandardRow(row) || isExternalRow(row);
}

/**
 * Cells locked: everything for Standard Content and vendor parts; for parts
 * marked standard, everything except the mark itself (so it can be undone).
 */
export function isLockedRow(row: AssemblyBomRow): boolean {
  return isExternalRow(row) || !!row.markedStandard;
}

/** Editable cells of `row` that differ from `against` (none for Standard Content, which isn't editable). */
export function changedFields(row: AssemblyBomRow, against: FieldValues | undefined): string[] {
  if (!against || isExternalRow(row)) return [];
  const r = row as unknown as Record<string, unknown>;
  return EDITABLE_FIELDS.filter((k) => !sameValue(k, r[k], against[k]));
}

/**
 * A record's updatedAt as an ISO string ("" when none). It arrives as JSON
 * text (or a Date), so it's normalized before comparing.
 */
export function stampOf(updatedAt: unknown): string {
  if (!updatedAt) return "";
  const date = new Date(updatedAt as string);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/** A name that is itself a catalog number (e.g. a part named 2714-1103). */
export function catalogNumberInName(name: string): string | null {
  const trimmed = name.trim();
  return CATALOG_NUMBER_FORMAT.test(trimmed) ? trimmed : null;
}

/**
 * On load: an item without a catalog number whose name is one gets the name as
 * its catalog number. It's an edit (marked, and written to Onshape's Part
 * number on Publish BOM). Locked items are left alone.
 */
export function fillCatalogNumberFromName(row: AssemblyBomRow): AssemblyBomRow {
  if (isLockedRow(row) || String(row.catalogNumber ?? "").trim()) return row;
  const fromName = catalogNumberInName(String(row.name ?? ""));
  if (!fromName) return row;
  const filled = { ...row, catalogNumber: fromName };
  return { ...filled, modified: changedFields(filled, filled.baseline ?? filled.loaded) };
}

/** Sets baseline/loaded/modified on a freshly loaded row. `saved` = its database values, if saved. */
export function withChangeTracking(row: AssemblyBomRow, saved: FieldValues | null): AssemblyBomRow {
  const loaded = editableValues(row);
  // Fields the database doesn't keep for this item compare against what was loaded.
  const baseline = saved ? { ...loaded, ...saved } : loaded;
  const tracked = { ...row, loaded, baseline };
  return { ...tracked, modified: changedFields(tracked, baseline) };
}

/** Recomputes a row's list of unpublished edits (after parts were combined). */
export const retrackRow = (row: AssemblyBomRow): AssemblyBomRow => ({ ...row, modified: changedFields(row, row.baseline ?? row.loaded) });
