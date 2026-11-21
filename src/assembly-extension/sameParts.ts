/**
 * Items in the panel's tree that share a catalog number (the team mentor's
 * rule): the same name and catalog number means the same part, even when it
 * was modeled several times; the same catalog number with different names is
 * a mistake for the modeler to fix in Onshape. Nothing here changes rows: the
 * panel shows the groups, and combines them only when the user says so
 * (copyRows.ts).
 *
 * Compared after normalising: catalog numbers trimmed and upper-cased; names
 * trimmed, inner spaces collapsed and lower-cased.
 *
 * Never grouped: items without a usable catalog number (empty, or a
 * placeholder such as "-", "TBD", "N/A", "?"), parts with Onshape's default
 * "Part N" name, and bought items (Standard Content, vendor parts, items
 * marked standard), which aren't numbered by the team.
 */
import type AssemblyBomRow from "./AssemblyBomRow";

export interface SameNumberGroup {
  /** The normalised catalog number (group key). */
  key: string;
  /** As written on the first item. */
  catalogNumber: string;
  /** One row per item (distinct ids), in tree order. */
  items: AssemblyBomRow[];
  /** "copies": all parts with the same name; "conflict": different names, or an assembly among them. */
  kind: "copies" | "conflict";
  /** Only parts can be combined; a group with an assembly can only be fixed in Onshape. */
  combinable: boolean;
}

const PLACEHOLDER = /^(-+|_+|\?+|tbd|tba|n\/?a|none|x+)$/i;
const DEFAULT_NAME = /^part \d+$/;

/** A catalog number as compared ("" for none or a placeholder). */
export function normalizeCatalogNumber(value: unknown): string {
  const n = String(value ?? "").trim().toUpperCase();
  return n && !PLACEHOLDER.test(n) ? n : "";
}

export const catalogKey = (row: AssemblyBomRow): string => normalizeCatalogNumber(row.catalogNumber);

export const nameKey = (row: AssemblyBomRow): string =>
  String(row.name ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const isBought = (row: AssemblyBomRow) => row.vendor !== "" || !!row.isStandardContent || !!row.markedStandard;

/** Whether an item takes part in catalog-number grouping at all. */
export function isGrouped(row: AssemblyBomRow): boolean {
  if (row.copyOf || isBought(row) || !catalogKey(row)) return false;
  const name = nameKey(row);
  return row.isAssembly || (!!name && !DEFAULT_NAME.test(name));
}

/** Catalog numbers used by more than one item of the tree, in tree order. */
export function findSameNumberGroups(rows: AssemblyBomRow[]): SameNumberGroup[] {
  const byKey = new Map<string, Map<string, AssemblyBomRow>>();
  for (const row of rows) {
    if (!isGrouped(row)) continue;
    const key = catalogKey(row);
    const items = byKey.get(key) ?? new Map<string, AssemblyBomRow>();
    if (!items.has(row.id)) items.set(row.id, row); // an item used in several places counts once
    byKey.set(key, items);
  }
  const groups: SameNumberGroup[] = [];
  for (const [key, byId] of byKey) {
    const items = [...byId.values()];
    if (items.length < 2) continue;
    const combinable = items.every((r) => !r.isAssembly);
    const sameName = new Set(items.map(nameKey)).size === 1;
    groups.push({
      key,
      catalogNumber: String(items[0].catalogNumber ?? "").trim(),
      items,
      kind: combinable && sameName ? "copies" : "conflict",
      combinable,
    });
  }
  return groups;
}
