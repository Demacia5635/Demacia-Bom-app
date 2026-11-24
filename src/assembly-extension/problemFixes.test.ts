import { describe, expect, it } from "vitest";
import { mostUsedMaterial, suggestFix } from "./problemFixes";
import { testRow } from "./testRows";

const rows = [
  testRow({ id: "a", material: "6061 Aluminum" }),
  testRow({ id: "b", material: "6061 Aluminum" }),
  { ...testRow({ id: "b", material: "6061 Aluminum" }), parentId: "p2" }, // same part, used twice
  testRow({ id: "c", material: "PLA" }),
  testRow({ id: "bought", material: "Steel", vendor: "McMaster" }),
  testRow({ id: "asm", material: "Steel", isAssembly: true }),
];

describe("mostUsedMaterial", () => {
  it("counts each made part once, leaving out bought parts and assemblies", () => {
    expect(mostUsedMaterial(rows)).toEqual({ material: "6061 Aluminum", count: 2 });
    expect(mostUsedMaterial([testRow({ material: "" })])).toBeNull();
  });
});

describe("suggestFix", () => {
  it("offers the catalog number in the name", () => {
    const row = testRow({ name: "2714-1003", catalogNumber: "" });
    expect(suggestFix(row, "catalogNumber", rows, "")).toEqual({
      label: "Use 2714-1003 (from the name)",
      field: "catalogNumber",
      value: "2714-1003",
    });
    expect(suggestFix(testRow({ name: "Plate" }), "catalogNumber", rows, "")).toBeNull();
    expect(suggestFix(testRow({ name: "2714-1003", catalogNumber: "2714-1003" }), "catalogNumber", rows, "")).toBeNull();
  });

  it("offers the most used material for a missing one", () => {
    expect(suggestFix(testRow(), "material", rows, "")).toMatchObject({
      label: "Use 6061 Aluminum (used by 2 parts here)",
      value: "6061 Aluminum",
    });
    expect(suggestFix(testRow({ material: "PLA" }), "material", rows, "")).toBeNull();
  });

  it("offers the Default engineer, when there is one", () => {
    expect(suggestFix(testRow(), "engineer", rows, " Dana ")).toMatchObject({ label: "Use Dana (Default engineer)", value: "Dana" });
    expect(suggestFix(testRow(), "engineer", rows, "")).toBeNull();
  });
});
