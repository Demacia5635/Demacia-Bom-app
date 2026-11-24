import { describe, expect, it } from "vitest";
import { findSameNumberGroups, isGrouped, normalizeCatalogNumber, quotedList } from "./sameParts";
import { testRow } from "./testRows";

describe("normalizeCatalogNumber", () => {
  it("trims and upper-cases, and treats placeholders as none", () => {
    expect(normalizeCatalogNumber(" 2714-1003a ")).toBe("2714-1003A");
    for (const p of ["-", "---", "TBD", "n/a", "?", "none", "xx", "", null, undefined]) {
      expect(normalizeCatalogNumber(p)).toBe("");
    }
  });
});

describe("isGrouped", () => {
  it("skips bought items, items without a number and default part names", () => {
    expect(isGrouped(testRow({ catalogNumber: "2714-1003" }))).toBe(true);
    expect(isGrouped(testRow({ catalogNumber: "" }))).toBe(false);
    expect(isGrouped(testRow({ catalogNumber: "2714-1003", vendor: "McMaster" }))).toBe(false);
    expect(isGrouped(testRow({ catalogNumber: "2714-1003", isStandardContent: true }))).toBe(false);
    expect(isGrouped(testRow({ catalogNumber: "2714-1003", markedStandard: true }))).toBe(false);
    expect(isGrouped(testRow({ catalogNumber: "2714-1003", name: "Part 12" }))).toBe(false);
    // An assembly counts even with a default-looking name.
    expect(isGrouped(testRow({ catalogNumber: "2714-1000", name: "Part 1", isAssembly: true }))).toBe(true);
  });
});

describe("findSameNumberGroups", () => {
  it("groups same number + same name as copies that can be combined", () => {
    const a = testRow({ id: "a", catalogNumber: "2714-1003", name: "Spacer" });
    const b = testRow({ id: "b", catalogNumber: "2714-1003 ", name: " spacer" });
    const groups = findSameNumberGroups([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: "2714-1003", kind: "copies", combinable: true });
    expect(groups[0].items.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("calls different names, or an assembly among them, a conflict", () => {
    const names = findSameNumberGroups([
      testRow({ id: "a", catalogNumber: "2714-1003", name: "Spacer" }),
      testRow({ id: "b", catalogNumber: "2714-1003", name: "Bracket" }),
    ]);
    expect(names[0]).toMatchObject({ kind: "conflict", combinable: true });
    const withAssembly = findSameNumberGroups([
      testRow({ id: "a", catalogNumber: "2714-1003", name: "Arm" }),
      testRow({ id: "b", catalogNumber: "2714-1003", name: "Arm", isAssembly: true }),
    ]);
    expect(withAssembly[0]).toMatchObject({ kind: "conflict", combinable: false });
  });

  it("counts an item used in several places once, and ignores single items", () => {
    const one = testRow({ id: "a", catalogNumber: "2714-1003" });
    expect(findSameNumberGroups([one, { ...one, parentId: "p2" }])).toEqual([]);
  });
});

describe("quotedList", () => {
  it("joins names like a sentence", () => {
    expect(quotedList([])).toBe("");
    expect(quotedList(["A"])).toBe('"A"');
    expect(quotedList(["A", "B", "C"])).toBe('"A", "B" and "C"');
  });
});
