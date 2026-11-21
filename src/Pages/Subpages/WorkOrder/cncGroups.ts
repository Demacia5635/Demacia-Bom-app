import type WorkOrderTableRow from "./WorkOrderTableRow";

/**
 * CNC groups: parts of a work order cut together in one CNC run (one G-code),
 * because they have the same thickness and material. In the table they sit
 * next to each other and share one Links cell. Stored in the work order's
 * cncGroups (server: POST /db/workOrder/id/:id/cncGroup), apart from its
 * parts, so a part's own links come back when it leaves a group.
 */
export interface CncGroup {
  id: string;
  partIDs: string[];
  links: string;
}

/** Groups as stored or sent by the server (fields may be missing), with the defaults filled in. */
export function toCncGroups(groups: { id: string; partIDs?: string[]; links?: string }[] | undefined): CncGroup[] {
  return (groups ?? []).map((g) => ({ id: g.id, partIDs: g.partIDs ?? [], links: g.links ?? "" }));
}

/** Methods whose parts are never cut on the CNC, so they aren't suggested. */
const NOT_CNC = new Set(["Lathed", "Printed", "Externally produced", "Purchased"]);

/** A part's thickness in mm: the smallest side of its size ("25 × 8 × 6 mm" -> 6), or null. */
export function partThickness(size: string | undefined): number | null {
  const sides = (size ?? "").match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return sides.length === 3 ? Math.min(...sides) : null;
}

/** "6 mm", "6.4 mm" */
function mmText(mm: number): string {
  return `${Math.round(mm * 10) / 10} mm`;
}

export interface CncSuggestion {
  /** e.g. "6 mm · Aluminum 6061" */
  label: string;
  partIDs: string[];
  names: string[];
}

/** Whether a row could be cut on the CNC (made here, not lathed / printed / bought). */
export function isCncCandidate(row: WorkOrderTableRow): boolean {
  return !row.isStandardContent && !row.markedStandard && (row.vendor ?? "").trim() === "" && !NOT_CNC.has(row.manufacturingMethod);
}

/**
 * Parts that could share a CNC run: same thickness and material, not in a
 * group yet. Thicknesses are rounded to 0.1 mm and grouped by that value
 * (not "within 0.1 mm of each other", which would chain 6.0, 6.1 and 6.2
 * into one group). Parts without a size or material aren't suggested.
 */
export function suggestCncGroups(rows: WorkOrderTableRow[], grouped: ReadonlySet<string>): CncSuggestion[] {
  const byKey = new Map<string, { label: string; rows: WorkOrderTableRow[] }>();
  for (const row of rows) {
    if (!row.partID || grouped.has(row.partID) || !isCncCandidate(row)) continue;
    const thickness = partThickness(row.size);
    const material = row.material.trim();
    if (thickness === null || !material) continue;
    const rounded = Math.round(thickness * 10) / 10;
    const key = `${rounded}|${material.toLowerCase()}`;
    const entry = byKey.get(key) ?? { label: `${mmText(rounded)} · ${material}`, rows: [] };
    entry.rows.push(row);
    byKey.set(key, entry);
  }
  return [...byKey.values()]
    .filter((e) => e.rows.length >= 2)
    .map((e) => ({ label: e.label, partIDs: e.rows.map((r) => r.partID!), names: e.rows.map((r) => r.name) }));
}

/**
 * The rows as the table shows them: each group's parts placed together (where
 * its first part is), and their Links replaced by the group's. `rows` keep
 * each part's own links.
 */
export function applyCncGroups(rows: WorkOrderTableRow[], groups: CncGroup[]): WorkOrderTableRow[] {
  const groupOf = new Map<string, CncGroup>();
  for (const g of groups) for (const p of g.partIDs) groupOf.set(p, g);
  if (groupOf.size === 0) return rows;

  const membersOf = new Map<string, WorkOrderTableRow[]>();
  for (const row of rows) {
    const g = row.partID ? groupOf.get(row.partID) : undefined;
    if (g) membersOf.set(g.id, [...(membersOf.get(g.id) ?? []), row]);
  }
  const out: WorkOrderTableRow[] = [];
  const placed = new Set<string>();
  for (const row of rows) {
    const g = row.partID ? groupOf.get(row.partID) : undefined;
    if (!g) {
      out.push(row);
      continue;
    }
    if (placed.has(g.id)) continue;
    placed.add(g.id);
    for (const member of membersOf.get(g.id) ?? []) out.push({ ...member, cncGroupID: g.id, links: g.links });
  }
  return out;
}

/** Links for a new group: each member's own links, without repeats. */
export function combinedLinks(rows: WorkOrderTableRow[]): string {
  return [...new Set(rows.map((r) => (r.links ?? "").trim()).filter(Boolean))].join(" ");
}
