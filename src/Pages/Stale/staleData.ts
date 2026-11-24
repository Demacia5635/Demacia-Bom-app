/** Work orders whose parts changed since they were made (server: GET /api/admin/stale). */

export interface StalePart {
  partID: string;
  name?: string;
  change: "revision" | "quantity" | "added" | "removed" | "edited";
  revisionAtCreation?: number | string;
  revisionNow?: number | string;
  quantityAtCreation?: number;
  quantityNow?: number;
}

export interface StaleOrder {
  workOrder: { id: string; name?: string; owner?: string; bomID?: string; createdAt?: string };
  /** Not 100% finished (the production rule). */
  open: boolean;
  /**
   * The order kept each part's revision and quantity when it was made, so the
   * changes are exact; without it (older orders) only "edited" is known: the
   * part was saved after the order was made, which may not be a real change.
   */
  snapshot: boolean;
  parts: StalePart[];
}

export interface PartChanges {
  partID: string;
  name: string;
  /** Each change in words: "rev 2 → 4", "qty 4 → 6", "added to the BOM", … */
  changes: string[];
  /** Only "edited": maybe changed (older order). */
  maybe: boolean;
}

function describe(p: StalePart): string {
  switch (p.change) {
    case "revision":
      return `rev ${p.revisionAtCreation ?? "?"} → ${p.revisionNow ?? "?"}`;
    case "quantity":
      return `qty ${p.quantityAtCreation ?? "?"} → ${p.quantityNow ?? "?"}`;
    case "added":
      return p.quantityNow != null ? `added to the BOM (qty ${p.quantityNow})` : "added to the BOM";
    case "removed":
      return "removed from the BOM";
    case "edited":
      return "saved since the order was made (maybe changed)";
    default:
      return String(p.change);
  }
}

/** One line per part, its changes together (a part can change both revision and quantity). */
export function partChanges(parts: StalePart[]): PartChanges[] {
  const byPart = new Map<string, PartChanges>();
  for (const p of parts) {
    let row = byPart.get(p.partID);
    if (!row) {
      row = { partID: p.partID, name: p.name || p.partID, changes: [], maybe: true };
      byPart.set(p.partID, row);
    }
    row.changes.push(describe(p));
    if (p.change !== "edited") row.maybe = false;
  }
  return [...byPart.values()];
}

/** Open orders first, exact (snapshot) before "maybe", then the most changes. */
export function sortStale(orders: StaleOrder[]): StaleOrder[] {
  return [...orders].sort(
    (a, b) =>
      Number(b.open) - Number(a.open) ||
      Number(b.snapshot) - Number(a.snapshot) ||
      new Set(b.parts.map((p) => p.partID)).size - new Set(a.parts.map((p) => p.partID)).size,
  );
}
