/** The production board's data (server: GET /api/admin/production) and how it's ordered. */

export interface ProductionOrder {
  id: string;
  name?: string;
  owner?: string;
  createdAt?: string;
  updatedAt?: string;
  bomID?: string;
  madeParts?: number;
  finishedParts?: number;
  percent?: number;
  open?: boolean;
  blocked?: { toBuy: number; noMaterial: number };
  /** Its made lines, by status. */
  byStatus?: Record<string, number>;
  purchased?: { lines: number; toBuy: number; finished: number; untracked: number };
  /** Set when its BOM tree couldn't be built. */
  error?: string;
}

export interface ProductionReply {
  orders: ProductionOrder[];
  totals: {
    open: number;
    blockedOrders: number;
    byStatus: Record<string, number>;
    /** Unfinished made lines of open orders, by manufacturing method: the queue per process. */
    byMethodOpen: Record<string, number>;
    byOwner: Record<string, number>;
  };
}

export const blockedCount = (o: ProductionOrder) => (o.blocked?.toBuy ?? 0) + (o.blocked?.noMaterial ?? 0);

/**
 * Open orders (and ones that failed to load) first, the blocked ones on top,
 * then the furthest behind; finished orders apart, newest first.
 */
export function splitOrders(orders: ProductionOrder[]): { open: ProductionOrder[]; done: ProductionOrder[] } {
  const open = orders.filter((o) => o.open || o.error);
  const done = orders.filter((o) => !o.open && !o.error);
  open.sort(
    (a, b) =>
      Number(!!b.error) - Number(!!a.error) ||
      Number(blockedCount(b) > 0) - Number(blockedCount(a) > 0) ||
      (a.percent ?? 0) - (b.percent ?? 0) ||
      (a.name ?? "").localeCompare(b.name ?? "")
  );
  done.sort((a, b) => (b.updatedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.createdAt ?? ""));
  return { open, done };
}

/** A { name: n } count as entries, largest first, zeros left out. */
export function sortedCounts(counts: Record<string, number> | undefined): [string, number][] {
  return Object.entries(counts ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
