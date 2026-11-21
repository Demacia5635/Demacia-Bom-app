/**
 * Moving copies between rows when someone fixes a wrong guess of the copy
 * check (sameParts.ts) in the panel: "Not the same part" takes a copy out of
 * its combined row, "Same part after all" puts it back. Pure functions over
 * the panel's rows; `retrack` recomputes a row's list of unpublished edits.
 *
 * A combined row is the copy it shows (pickShownRow) with the total quantity,
 * its copies in `copies` (each as its own row) and the others' part IDs in
 * `copyPartIDs`. Rows of copies of one shape share `copyGroup`; the marked
 * ones (keepSeparate) are kept in their own row next to the unmarked ones.
 */
import type AssemblyBomRow from "./AssemblyBomRow";

type Retrack = (row: AssemblyBomRow) => AssemblyBomRow;

/** Which copy a combined row shows (same order as pickShown in sameParts.ts). */
export function pickShownRow(members: AssemblyBomRow[]): AssemblyBomRow {
  const rank = (r: AssemblyBomRow) =>
    (/^Part \d+$/.test(String(r.name ?? "").trim()) ? 2 : 0) + (String(r.catalogNumber ?? "").trim() ? 0 : 1);
  return [...members].sort((a, b) => rank(a) - rank(b) || (a.entityID < b.entityID ? -1 : 1))[0];
}

/** The copies a row stands for: its `copies`, or the row itself. */
const membersOf = (row: AssemblyBomRow) => (row.copies?.length ? row.copies : [row]);

/**
 * One row for `members` (copies of one part, each as its own row): the shown
 * copy with the total quantity, or the copy itself when there's only one.
 * `carry` is the row it replaces under this parent: its unpublished edits and
 * expand state are kept.
 */
export function combineMemberRows(
  members: AssemblyBomRow[],
  carry: AssemblyBomRow | null,
  parentId: string | null,
  copyGroup: string | undefined,
  keepSeparate: boolean,
  retrack: Retrack
): AssemblyBomRow {
  const shown = pickShownRow(members);
  const carried = carry as unknown as Record<string, unknown> | null;
  const edits = Object.fromEntries(
    (carry?.modified ?? []).filter((k) => k !== "keepSeparate").map((k) => [k, carried![k]])
  );
  return retrack({
    ...shown,
    ...edits,
    parentId,
    copyGroup,
    keepSeparate,
    isExpanded: carry?.isExpanded ?? false,
    ...(members.length > 1
      ? {
          quantity: members.reduce((sum, m) => sum + (Number(m.quantity) || 1), 0),
          copies: members.map((m) => ({ ...m, keepSeparate })),
          copyPartIDs: members.filter((m) => m !== shown).map((m) => m.entityID),
        }
      : { quantity: shown.quantity, copies: undefined, copyPartIDs: undefined }),
  });
}

/** The marked (or unmarked) row of the same copies next to `row`, if there is one. */
function partnerRow(rows: AssemblyBomRow[], row: AssemblyBomRow, marked: boolean): AssemblyBomRow | undefined {
  return rows.find(
    (s) => s !== row && !s.isAssembly && s.parentId === row.parentId && !!row.copyGroup && s.copyGroup === row.copyGroup && !!s.keepSeparate === marked
  );
}

/**
 * "Not the same part": part `partID` leaves combined row `combinedId` (under
 * every parent that has it) and joins the marked row next to it, or becomes
 * a row of its own.
 */
export function splitCopyRows(rows: AssemblyBomRow[], combinedId: string, partID: string, retrack: Retrack): AssemblyBomRow[] {
  const next = [...rows];
  for (const row of rows.filter((r) => r.id === combinedId && r.copies?.length)) {
    const moved = row.copies!.find((c) => c.entityID === partID);
    if (!moved) continue;
    const rest = combineMemberRows(row.copies!.filter((c) => c !== moved), row, row.parentId, row.copyGroup, !!row.keepSeparate, retrack);
    const marked = partnerRow(next, row, true);
    const markedRow = combineMemberRows([...(marked ? membersOf(marked) : []), moved], marked ?? null, row.parentId, row.copyGroup, true, retrack);
    next.splice(next.indexOf(row), 1, rest, ...(marked ? [] : [markedRow]));
    if (marked) next[next.indexOf(marked)] = markedRow;
  }
  return next;
}

/**
 * Undoes "Not the same part" for marked row `rowId`: its copies join the
 * unmarked row next to it. `later` when there was none here (its copies were
 * loaded elsewhere): the mark is cleared, and it combines after Publish BOM
 * and Refresh BOM.
 */
export function recombineRows(rows: AssemblyBomRow[], rowId: string, retrack: Retrack): { rows: AssemblyBomRow[]; later: boolean } {
  const next = [...rows];
  let later = false;
  for (const row of rows.filter((r) => r.id === rowId && r.keepSeparate && !r.isAssembly)) {
    const unmarked = partnerRow(next, row, false);
    if (unmarked) {
      next[next.indexOf(unmarked)] = combineMemberRows([...membersOf(unmarked), ...membersOf(row)], unmarked, row.parentId, row.copyGroup, false, retrack);
      next.splice(next.indexOf(row), 1);
    } else {
      next[next.indexOf(row)] = combineMemberRows(membersOf(row), row, row.parentId, row.copyGroup, false, retrack);
      later = true;
    }
  }
  return { rows: next, later };
}
