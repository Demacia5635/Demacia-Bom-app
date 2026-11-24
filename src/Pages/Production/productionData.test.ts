import { describe, expect, it } from "vitest";
import { sortedCounts, splitOrders, type ProductionOrder } from "./productionData";

const o = (id: string, over: Partial<ProductionOrder>): ProductionOrder => ({ id, name: id, open: true, percent: 50, blocked: { toBuy: 0, noMaterial: 0 }, ...over });

describe("splitOrders", () => {
  it("puts failed, then blocked, then furthest behind first; done apart, newest first", () => {
    const { open, done } = splitOrders([
      o("ahead", { percent: 90 }),
      o("behind", { percent: 10 }),
      o("blocked", { percent: 80, blocked: { toBuy: 2, noMaterial: 0 } }),
      o("broken", { open: false, error: "tree" }),
      o("doneOld", { open: false, percent: 100, updatedAt: "2026-11-01" }),
      o("doneNew", { open: false, percent: 100, updatedAt: "2026-11-20" }),
    ]);
    expect(open.map((x) => x.id)).toEqual(["broken", "blocked", "behind", "ahead"]);
    expect(done.map((x) => x.id)).toEqual(["doneNew", "doneOld"]);
  });
});

describe("sortedCounts", () => {
  it("drops zeros and sorts largest first", () => {
    expect(sortedCounts({ CNC: 3, Manual: 0, Printed: 7, Lathed: 3 })).toEqual([["Printed", 7], ["CNC", 3], ["Lathed", 3]]);
    expect(sortedCounts(undefined)).toEqual([]);
  });
});
