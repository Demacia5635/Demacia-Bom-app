/**
 * Suggested fixes for the work-order problems (workOrderProblems.ts), offered
 * as "💡 Suggested fix" when a red cell is right-clicked:
 *  - a catalog number: the one in the item's name ("2714-1003"),
 *  - a missing material: the one most made parts in this tree use,
 *  - a missing engineer: the Default engineer (the Onshape user).
 * Pure functions, so they can be tested.
 */
import type AssemblyBomRow from "./AssemblyBomRow";
import { catalogNumberInName, isLockedRow } from "./rowRules";

export interface SuggestedFix {
  /** What the menu says, e.g. "Use 2714-1003 (from the name)". */
  label: string;
  /** The cell (column key) and the value to put in it. */
  field: string;
  value: string;
}

/** The material most made parts of the tree use (ties: the first found), with how many. */
export function mostUsedMaterial(rows: AssemblyBomRow[]): { material: string; count: number } | null {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.isAssembly || isLockedRow(r) || seen.has(r.id)) continue;
    seen.add(r.id);
    const m = String(r.material ?? "").trim();
    if (m) counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  let best: { material: string; count: number } | null = null;
  for (const [material, count] of counts) if (!best || count > best.count) best = { material, count };
  return best;
}

/** A fix for the problem in `row`'s `field` cell, or null when there's none to suggest. */
export function suggestFix(
  row: AssemblyBomRow,
  field: string,
  rows: AssemblyBomRow[],
  defaultEngineer: string
): SuggestedFix | null {
  if (field === "catalogNumber") {
    const fromName = catalogNumberInName(String(row.name ?? ""));
    if (fromName && fromName !== String(row.catalogNumber ?? "").trim()) {
      return { label: `Use ${fromName} (from the name)`, field, value: fromName };
    }
    return null;
  }
  if (field === "material" && !String(row.material ?? "").trim()) {
    const best = mostUsedMaterial(rows);
    if (!best) return null;
    return {
      label: `Use ${best.material} (used by ${best.count} part${best.count === 1 ? "" : "s"} here)`,
      field,
      value: best.material,
    };
  }
  if (field === "engineer" && defaultEngineer.trim()) {
    return { label: `Use ${defaultEngineer.trim()} (Default engineer)`, field, value: defaultEngineer.trim() };
  }
  return null;
}
