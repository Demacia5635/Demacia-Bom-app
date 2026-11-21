/**
 * Which rows a Table shows, as pure functions over its data: children per
 * parent, the row filter's matches (and every row above one, kept open),
 * sorting among siblings, the shown rows in order with their level, merged
 * cell spans and React keys.
 */
import type { ColumnConfig, RowData, SortConfig } from "../Table";

type Row = RowData & any;

/** A shown row. `open`: its children are shown (expanded, or opened by the row filter). */
export type RenderRow = Row & { level: number; open: boolean };

export interface FilterSets {
  matches: Set<string>;
  ancestors: Set<string>;
}

/** Sorts rows under one parent by the sort column; empty values last, in either direction. */
export function sortSiblings(rows: Row[], sortConfig: SortConfig | null): Row[] {
  if (!sortConfig) return rows;
  const { key, direction } = sortConfig;
  const dir = direction === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];

    if (aVal === bVal) return 0;
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * dir;
    }

    const aNum = Number(aVal);
    const bNum = Number(bVal);
    if (!isNaN(aNum) && !isNaN(bNum) && aVal !== '' && bVal !== '') {
      return (aNum - bNum) * dir;
    }

    return String(aVal).localeCompare(String(bVal)) * dir;
  });
}

/**
 * Children of each row, built once per data change. Looking them up by
 * scanning every row for every row made large tables slow (n x n work).
 */
export function groupChildren(data: Row[]): Map<string | null, Row[]> {
  const map = new Map<string | null, Row[]>();
  for (const row of data) {
    const list = map.get(row.parentId);
    if (list) list.push(row);
    else map.set(row.parentId, [row]);
  }
  return map;
}

/**
 * With a row filter: the matching rows, and every row above one (kept open).
 * An id can sit under several parents (the BOM extension lists a shared
 * sub-assembly under each parent that uses it), so follow every parent.
 */
export function filterMatches(data: Row[], rowFilter: (row: Row) => boolean): FilterSets {
  const parentsOf = new Map<string, (string | null)[]>();
  for (const row of data) {
    const list = parentsOf.get(row.id);
    if (list) list.push(row.parentId);
    else parentsOf.set(row.id, [row.parentId]);
  }
  const matches = new Set<string>();
  const ancestors = new Set<string>();
  const addAncestors = (id: string) => {
    for (const p of parentsOf.get(id) ?? []) {
      if (p === null || ancestors.has(p)) continue;
      ancestors.add(p);
      addAncestors(p);
    }
  };
  for (const row of data) {
    if (!rowFilter(row)) continue;
    matches.add(row.id);
    addAncestors(row.id);
  }
  return { matches, ancestors };
}

/** The rows shown, in order, each with its level and whether its children show. */
export function visibleRows(
  childrenByParent: Map<string | null, Row[]>,
  sortConfig: SortConfig | null,
  filterSets: FilterSets | null,
  hideRow: ((row: Row) => boolean) | undefined
): RenderRow[] {
  const result: RenderRow[] = [];
  const addChildren = (parentId: string | null, level: number) => {
    const children = sortSiblings(childrenByParent.get(parentId) ?? [], sortConfig);
    for (const child of children) {
      if (hideRow?.(child)) continue;
      if (filterSets && !filterSets.matches.has(child.id) && !filterSets.ancestors.has(child.id)) continue;
      const open = childrenByParent.has(child.id) && (filterSets ? filterSets.ancestors.has(child.id) : child.isExpanded);
      result.push({ ...child, level, open });
      if (open) addChildren(child.id, level + 1);
    }
  };
  addChildren(null, 0);
  return result;
}

/**
 * For columns with mergeKey: per rendered row, how many rows its cell spans
 * (1 = normal, 0 = covered by the merged cell above). Only rows that end up
 * next to each other merge (a sort or filter can split a group).
 */
export function mergedCellSpans(columns: ColumnConfig[], renderedRows: Row[]): Map<string, number[]> {
  const spans = new Map<string, number[]>();
  for (const col of columns) {
    if (!col.mergeKey) continue;
    const keys = renderedRows.map((r) => col.mergeKey!(r) || '');
    const colSpans = keys.map(() => 1);
    for (let i = 0; i < keys.length; ) {
      let j = i + 1;
      if (keys[i]) while (j < keys.length && keys[j] === keys[i]) j++;
      colSpans[i] = j - i;
      for (let k = i + 1; k < j; k++) colSpans[k] = 0;
      i = j;
    }
    spans.set(col.key, colSpans);
  }
  return spans;
}

/**
 * React key of each shown row. Row ids aren't always unique: in the BOM
 * extension a part used in several sub-assemblies (or listed twice by
 * Onshape) has the same id each time. Duplicate React keys make React leave
 * stale rows on screen and multiply rows on every re-render (hidden standard
 * parts stayed visible; 2 sensors became 5). So the key is the parent + id,
 * plus a counter for repeats under the same parent. The row id itself
 * (data-row-id, edits) is unchanged.
 */
export function renderKeys(visibleData: RenderRow[]): Map<RenderRow, string> {
  const keys = new Map<RenderRow, string>();
  const seen = new Map<string, number>();
  for (const row of visibleData) {
    const base = `${row.parentId ?? ''}>${row.id}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    keys.set(row, n === 0 ? base : `${base}#${n}`);
  }
  return keys;
}
