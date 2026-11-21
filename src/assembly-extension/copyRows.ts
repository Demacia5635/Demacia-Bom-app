/**
 * Combining the items that share a catalog number (sameParts.ts) into one
 * part, when the user says so in the panel. Pure functions over the panel's
 * rows; `retrack` recomputes a row's list of unpublished edits.
 *
 * What a combined part is:
 * - One record. The copy whose record it uses (pickRecordRow): one already
 *   saved in the database, so it keeps its files and history; among several,
 *   or none, the lowest row id. The same choice on every load. Every row of
 *   the part, under every parent, gets that copy's id and data, so Publish
 *   saves one record and checks that record's dbUpdatedAt.
 * - Under each parent, one row: the quantities of the copies used there
 *   added up, the copies in `copies` (each its own row, shown under it).
 * - The other copies' records stay in the database untouched (no longer
 *   listed in a parent's BOM).
 * - Publish exports the thumbnail, STL and Parasolid from the record's copy
 *   only, and writes edited cells to every copy in Onshape.
 * - Edits made before combining are kept: those of the first row under each
 *   parent win, then the others' for cells it didn't edit.
 */
import type AssemblyBomRow from "./AssemblyBomRow";
import { catalogKey, isGrouped } from "./sameParts";

type Retrack = (row: AssemblyBomRow) => AssemblyBomRow;

/** The items a row stands for: its copies, or itself. */
export const membersOf = (row: AssemblyBomRow): AssemblyBomRow[] => (row.copies?.length ? row.copies : [row]);

/** Which copy's record a combined part uses: a saved one first, then the lowest row id. */
export function pickRecordRow(members: AssemblyBomRow[]): AssemblyBomRow {
  const saved = (r: AssemblyBomRow) => (r.source === "db" ? 0 : 1);
  return [...members].sort((a, b) => saved(a) - saved(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

/**
 * `rows` with the parts whose catalog number is in `keys` (normalised, see
 * catalogKey) combined: one part per catalog number, one row per parent.
 * Assemblies are never combined.
 */
export function combineSameNumber(rows: AssemblyBomRow[], keys: ReadonlySet<string>, retrack: Retrack): AssemblyBomRow[] {
  const isTarget = (r: AssemblyBomRow) => !r.isAssembly && isGrouped(r) && keys.has(catalogKey(r));

  // Every item of each catalog number, over the whole tree.
  const itemsByKey = new Map<string, Map<string, AssemblyBomRow>>();
  for (const row of rows) {
    if (!isTarget(row)) continue;
    const items = itemsByKey.get(catalogKey(row)) ?? new Map<string, AssemblyBomRow>();
    for (const m of membersOf(row)) if (!items.has(m.id)) items.set(m.id, m);
    itemsByKey.set(catalogKey(row), items);
  }
  const recordByKey = new Map([...itemsByKey].map(([key, items]) => [key, pickRecordRow([...items.values()])]));

  const out: AssemblyBomRow[] = [];
  const done = new Set<string>();
  for (const row of rows) {
    if (!isTarget(row)) {
      out.push(row);
      continue;
    }
    const key = catalogKey(row);
    const slot = `${row.parentId ?? ""}\n${key}`;
    if (done.has(slot)) continue; // folded into the first row of this part under this parent
    done.add(slot);

    const here = rows.filter((s) => s.parentId === row.parentId && isTarget(s) && catalogKey(s) === key);
    const members = [...new Map(here.flatMap(membersOf).map((m) => [m.id, m])).values()];
    const record = recordByKey.get(key)!;
    const edits: Record<string, unknown> = {};
    for (const h of here) {
      const values = h as unknown as Record<string, unknown>;
      for (const k of h.modified ?? []) if (!(k in edits)) edits[k] = values[k];
    }
    out.push(
      retrack({
        ...record,
        ...edits,
        parentId: row.parentId,
        isExpanded: row.isExpanded,
        quantity: members.reduce((sum, m) => sum + (Number(m.quantity) || 1), 0),
        // Also kept for a single copy that isn't the record's: Publish writes edits to it too.
        copies: members.length > 1 || members[0].id !== record.id ? members.map((m) => ({ ...m, copies: undefined })) : undefined,
      })
    );
  }
  return out;
}
