import { describe, expect, it } from "vitest";
import { catalogTree, isBoughtAssembly, workOrderLines, type BomTree } from "./bomTree";
import type { BomModel, PartModel } from "./Models";

/** A tree from plain objects: `top` is the root. */
function tree(boms: Record<string, Partial<BomModel>>, parts: Record<string, Partial<PartModel>> = {}): BomTree {
  const full = (id: string, b: Partial<BomModel>) => ({ id, parts: [], subAssemblies: [], ...b }) as BomModel;
  return {
    rootId: "top",
    root: full("top", boms.top),
    boms: new Map(Object.entries(boms).filter(([id]) => id !== "top").map(([id, b]) => [id, full(id, b)])),
    parts: new Map(Object.entries(parts).map(([id, p]) => [id, { id, ...p } as PartModel])),
  };
}

describe("isBoughtAssembly", () => {
  it("is marked standard or has a vendor", () => {
    expect(isBoughtAssembly({ markedStandard: true })).toBe(true);
    expect(isBoughtAssembly({ vendor: " ACME " })).toBe(true);
    expect(isBoughtAssembly({ vendor: "   " })).toBe(false);
    expect(isBoughtAssembly(null)).toBe(false);
  });
});

describe("workOrderLines", () => {
  const sample = tree({
    top: { parts: [{ partID: "p1", quantity: 2 }], subAssemblies: [{ bomID: "made", quantity: 3 }, { bomID: "motor", quantity: 2 }, { bomID: "vend", quantity: 1 }] },
    made: { parts: [{ partID: "p1", quantity: 1 }, { partID: "p2", quantity: 4 }], subAssemblies: [{ bomID: "motor", quantity: 1 }, { bomID: "deep", quantity: 2 }] },
    deep: { parts: [{ partID: "p3", quantity: 1 }, { partID: "p1", quantity: 1 }] },
    motor: { markedStandard: true, parts: [{ partID: "inner", quantity: 5 }] },
    vend: { vendor: "ACME", parts: [{ partID: "inner2", quantity: 1 }] },
  });

  it("multiplies quantities through sub-assemblies and adds up repeats, sub-assemblies first", () => {
    const { totals } = workOrderLines(sample);
    expect([...totals]).toEqual([["motor", 5], ["p3", 6], ["p1", 11], ["p2", 12], ["vend", 1]]);
  });

  it("lists a bought sub-assembly as one line without its insides", () => {
    const { totals, bought } = workOrderLines(sample);
    expect([...bought.keys()]).toEqual(["motor", "vend"]);
    expect(totals.has("inner")).toBe(false);
    expect(totals.has("inner2")).toBe(false);
  });

  it("always opens the root, even when it is marked standard", () => {
    const t = tree({ top: { markedStandard: true, parts: [{ partID: "x", quantity: 1 }], subAssemblies: [{ bomID: "a", quantity: 2 }, { bomID: "a", quantity: 3 }] }, a: { parts: [{ partID: "y", quantity: 2 }] } });
    expect([...workOrderLines(t).totals]).toEqual([["y", 10], ["x", 1]]);
  });

  it("throws for an assembly that contains itself", () => {
    const t = tree({ top: { subAssemblies: [{ bomID: "loop", quantity: 1 }] }, loop: { parts: [{ partID: "z", quantity: 1 }], subAssemblies: [{ bomID: "top", quantity: 1 }] } });
    expect(() => workOrderLines(t)).toThrow("Assembly top contains itself (via top > loop)");
  });

  it("throws for a sub-assembly that isn't saved", () => {
    const t = tree({ top: { subAssemblies: [{ bomID: "gone", quantity: 1 }] } });
    expect(() => workOrderLines(t)).toThrow("Assembly gone isn't saved");
  });
});

describe("catalogTree", () => {
  it("checks a shared sub-assembly once and exempts bought items", () => {
    const t = tree(
      {
        top: { name: "Top", catalogNumber: "T-1", parts: [{ partID: "p1", quantity: 1 }], subAssemblies: [{ bomID: "a", quantity: 1 }, { bomID: "b", quantity: 1 }, { bomID: "a", quantity: 1 }] },
        a: { name: "A", catalogNumber: "A-1", subAssemblies: [{ bomID: "m", quantity: 1 }] },
        b: { name: "B", subAssemblies: [{ bomID: "m", quantity: 1 }] },
        m: { name: "Motor", vendor: "X" },
      },
      { p1: { name: "One", catalogNumber: "1", vendor: "V" } }
    );
    const { root, names } = catalogTree(t);
    expect(root.children.map((c) => c.id)).toEqual(["a", "b", "p1"]);
    expect(root.children[0].children.map((c) => c.id)).toEqual(["m"]);
    expect(root.children[1].children).toEqual([]); // m already checked under a
    expect(root.children[0].children[0].exempt).toBe(true); // bought sub-assembly
    expect(root.children[2].exempt).toBe(true); // vendor part
    expect(root.exempt).toBe(false); // the root is always checked
    expect(names.get("p1")).toBe("One");
  });
});
