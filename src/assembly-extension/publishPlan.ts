/**
 * What Publish BOM saves and in which order, from the rows on screen. Pure
 * functions (no React, no network) so they can be checked on their own.
 *
 * Rows: one per use. A part or sub-assembly used in several places has a row
 * under each parent, all with the same id (its record id). A sub-assembly's
 * contents are listed once, under its id.
 */
import type AssemblyBomRow from "./AssemblyBomRow";

/** Parent key of the top assembly's own children (they have parentId null). */
export const ROOT_PARENT = "__root__";

/** A sub-assembly marked standard is linked as a part: one bought item (saved as a part record with the same id). */
export function isLinkedAsPart(row: AssemblyBomRow): boolean {
  return !row.isAssembly || !!row.markedStandard;
}

/** One row per item (its first use): what gets saved, once each. */
export function distinctRows(rows: AssemblyBomRow[]): AssemblyBomRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.id) && !!seen.add(r.id));
}

/** Rows by parent id (ROOT_PARENT for the top assembly's children), every use included. */
export function childrenByParent(rows: AssemblyBomRow[]): Map<string, AssemblyBomRow[]> {
  const map = new Map<string, AssemblyBomRow[]>();
  for (const row of rows) {
    const key = row.parentId ?? ROOT_PARENT;
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

/**
 * The links an assembly record saves: each child once, with the total quantity
 * of its uses directly under this parent (Onshape can list one item on two
 * lines, e.g. per configuration).
 */
export function linkArrays(children: AssemblyBomRow[]): {
  parts: { partID: string; quantity: number }[];
  subAssemblies: { bomID: string; quantity: number }[];
} {
  const parts = new Map<string, number>();
  const subAssemblies = new Map<string, number>();
  for (const c of children) {
    const into = isLinkedAsPart(c) ? parts : subAssemblies;
    into.set(c.id, (into.get(c.id) ?? 0) + (c.quantity || 1));
  }
  return {
    parts: Array.from(parts, ([partID, quantity]) => ({ partID, quantity })),
    subAssemblies: Array.from(subAssemblies, ([bomID, quantity]) => ({ bomID, quantity })),
  };
}

/**
 * Save order: first every part (and sub-assembly marked standard), then the
 * other sub-assemblies by height (1 + the tallest sub-assembly inside), lowest
 * first, so each assembly's children are all saved before it. Height, not
 * depth: a sub-assembly used at several depths has one record and one set of
 * contents (under its id), so only its height is the same for every use. Each
 * item appears once (distinctRows); the top assembly isn't included.
 */
export function publishPhases(rows: AssemblyBomRow[]): AssemblyBomRow[][] {
  const items = distinctRows(rows);
  const children = childrenByParent(rows);
  const heights = new Map<string, number>();
  const heightOf = (id: string, path: Set<string>): number => {
    const known = heights.get(id);
    if (known !== undefined) return known;
    if (path.has(id)) return 0; // contains itself (the load stops these; just in case)
    path.add(id);
    let height = 1;
    for (const c of children.get(id) ?? []) {
      if (!isLinkedAsPart(c)) height = Math.max(height, 1 + heightOf(c.id, path));
    }
    path.delete(id);
    heights.set(id, height);
    return height;
  };

  const byHeight = new Map<number, AssemblyBomRow[]>();
  for (const r of items) {
    if (isLinkedAsPart(r)) continue;
    const h = heightOf(r.id, new Set());
    byHeight.set(h, [...(byHeight.get(h) ?? []), r]);
  }
  return [
    items.filter(isLinkedAsPart),
    ...[...byHeight.keys()].sort((a, b) => a - b).map((h) => byHeight.get(h)!),
  ].filter((phase) => phase.length > 0);
}
