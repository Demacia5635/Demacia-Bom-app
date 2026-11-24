import { describe, expect, it } from "vitest";
import { partChanges, sortStale, type StaleOrder } from "./staleData";

describe("partChanges", () => {
  it("puts a part's changes on one line, in words", () => {
    const rows = partChanges([
      { partID: "p1", name: "Bracket", change: "revision", revisionAtCreation: 2, revisionNow: 4 },
      { partID: "p1", name: "Bracket", change: "quantity", quantityAtCreation: 4, quantityNow: 6 },
      { partID: "p2", name: "Spacer", change: "added", quantityNow: 2 },
      { partID: "p3", change: "removed" },
    ]);
    expect(rows).toEqual([
      { partID: "p1", name: "Bracket", changes: ["rev 2 → 4", "qty 4 → 6"], maybe: false },
      { partID: "p2", name: "Spacer", changes: ["added to the BOM (qty 2)"], maybe: false },
      { partID: "p3", name: "p3", changes: ["removed from the BOM"], maybe: false },
    ]);
  });

  it("marks parts known only as edited as 'maybe'", () => {
    expect(partChanges([{ partID: "p1", change: "edited" }])[0]).toMatchObject({ maybe: true, changes: ["saved since the order was made (maybe changed)"] });
  });
});

describe("sortStale", () => {
  const o = (id: string, open: boolean, snapshot: boolean, n: number): StaleOrder => ({
    workOrder: { id },
    open,
    snapshot,
    parts: Array.from({ length: n }, (_, i) => ({ partID: `p${i}`, change: snapshot ? "revision" : "edited" })),
  });
  it("puts open, then exact, then the most changed first", () => {
    expect(sortStale([o("doneExact", false, true, 9), o("openMaybe", true, false, 9), o("openExact1", true, true, 1), o("openExact3", true, true, 3)]).map((x) => x.workOrder.id)).toEqual([
      "openExact3",
      "openExact1",
      "openMaybe",
      "doneExact",
    ]);
  });
});
