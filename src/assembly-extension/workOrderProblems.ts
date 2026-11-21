/**
 * What would stop a work order for the panel's tree: the website's
 * CreatingWO checks, shown on the cells before publishing.
 */
import type AssemblyBomRow from "./AssemblyBomRow";
import { checkCatalogTree, type CatalogNode } from "../util/catalogNumbers";
import { isLockedRow, STANDARD_PART_ENGINEER } from "./rowRules";
import { findSameNumberGroups } from "./sameParts";

/** Row ID used for the top assembly (which has no row) in the problem list. */
export const TOP_ASSEMBLY_ID = "__top__";

/**
 * What would stop a work order from being created for this tree, by row ID
 * then column key - the checks CreatingWO runs on the website: catalog numbers
 * that follow the numbering rules (util/catalogNumbers.ts) for every made item,
 * and a material and engineer for every made part. Bought items (Standard
 * Content, vendor parts, items marked standard) are skipped. Problems with
 * the top assembly's own number are under TOP_ASSEMBLY_ID.
 */
export function findWorkOrderProblems(
  rows: AssemblyBomRow[],
  top: { name: string; number: string },
  /** Used by Publish BOM for a made part not in the database yet without an engineer ("" if none). */
  defaultEngineer: string
): Map<string, Map<string, string>> {
  const problems = new Map<string, Map<string, string>>();
  const add = (id: string, key: string, text: string) => {
    const byField = problems.get(id) ?? new Map<string, string>();
    if (!byField.has(key)) byField.set(key, text);
    problems.set(id, byField);
  };

  // The tree as the rules see it (a part used in several places is checked in each).
  const root: CatalogNode = { id: TOP_ASSEMBLY_ID, name: top.name, number: top.number, isAssembly: true, exempt: false, children: [] };
  const nodes = new Map<AssemblyBomRow, CatalogNode>();
  for (const r of rows) {
    nodes.set(r, { id: r.id, name: r.name, number: String(r.catalogNumber ?? ""), isAssembly: r.isAssembly, exempt: isLockedRow(r), children: [] });
  }
  const assemblyNode = new Map<string, CatalogNode>();
  for (const [r, node] of nodes) if (r.isAssembly) assemblyNode.set(r.id, node);
  for (const [r, node] of nodes) {
    const parent = r.parentId === null ? root : assemblyNode.get(r.parentId);
    parent?.children.push(node);
  }
  // One catalog number on items with different names (or on an assembly and
  // another item): a mistake for the modeler to fix in Onshape (sameParts.ts).
  for (const group of findSameNumberGroups(rows)) {
    if (group.kind !== "conflict") continue;
    for (const item of group.items) {
      const others = group.items.filter((o) => o !== item).map((o) => `"${o.name}"${o.isAssembly ? " (assembly)" : ""}`);
      add(
        item.id,
        "catalogNumber",
        `${group.catalogNumber} is also used by ${others.join(", ")}. Give each its own catalog number in Onshape` +
          (group.combinable ? ', or press "Combine anyway" above the table if they are the same part.' : ".")
      );
    }
  }
  for (const p of checkCatalogTree(root)) add(p.id, "catalogNumber", p.message);

  // Made parts also need a material and an engineer.
  const seen = new Set<string>();
  for (const part of rows) {
    if (part.isAssembly || isLockedRow(part) || seen.has(part.id)) continue;
    seen.add(part.id);
    if (!String(part.material ?? "").trim()) add(part.id, "material", "Work orders need a material for made parts.");
    const engineer = String(part.engineer ?? "").trim();
    // Only a part not in the database yet gets the default engineer on Publish.
    if ((!engineer || engineer === STANDARD_PART_ENGINEER) && (part.source === "db" || !defaultEngineer)) {
      add(
        part.id,
        "engineer",
        part.source === "db"
          ? "Work orders need an engineer for made parts."
          : "Work orders need an engineer for made parts (or fill Default engineer when publishing)."
      );
    }
  }
  return problems;
}
