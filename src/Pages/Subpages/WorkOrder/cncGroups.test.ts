import { describe, expect, it } from "vitest";
import { applyCncGroups, combinedLinks, isCncCandidate, partThickness, suggestCncGroups, toCncGroups } from "./cncGroups";
import type WorkOrderTableRow from "./WorkOrderTableRow";

const row = (partID: string, extra: Partial<WorkOrderTableRow> = {}): WorkOrderTableRow => ({
  id: `wo-part-${partID}`,
  parentId: null,
  isExpanded: false,
  partID,
  name: partID.toUpperCase(),
  avatar: "",
  lastUpadte: "",
  productionMakingOwner: "",
  catalogNumber: "",
  quantityTotal: 1,
  statusCode: "In Planning",
  approxArrivalDate: "",
  manufacturingMethod: "Manual",
  material: "Aluminum 6061",
  Priority: "Medium",
  comments: "",
  links: "",
  onshapeURL: "",
  exportSTL: "",
  exportParasolid: "",
  vendor: "",
  size: "100 × 50 × 6 mm",
  ...extra,
});

describe("partThickness", () => {
  it("is the smallest side of a size", () => {
    expect(partThickness("25 × 8 × 6.4 mm")).toBe(6.4);
    expect(partThickness("")).toBeNull();
    expect(partThickness(undefined)).toBeNull();
  });
});

describe("isCncCandidate", () => {
  it("leaves out bought parts and lathed / printed ones", () => {
    expect(isCncCandidate(row("a"))).toBe(true);
    expect(isCncCandidate(row("a", { vendor: "ACME" }))).toBe(false);
    expect(isCncCandidate(row("a", { manufacturingMethod: "Printed" }))).toBe(false);
    expect(isCncCandidate(row("a", { markedStandard: true }))).toBe(false);
  });
});

describe("suggestCncGroups", () => {
  it("groups same thickness (to 0.1 mm) and material, two or more, not yet grouped", () => {
    const rows = [
      row("a"),
      row("b", { size: "30 × 20 × 6.04 mm" }),
      row("c", { material: "Steel" }),
      row("d", { size: "" }),
      row("e"),
    ];
    const suggestions = suggestCncGroups(rows, new Set(["e"]));
    expect(suggestions).toEqual([{ label: "6 mm · Aluminum 6061", partIDs: ["a", "b"], names: ["A", "B"] }]);
  });
});

describe("applyCncGroups", () => {
  it("puts a group's parts together with the group's links, where its first part was", () => {
    const rows = [row("a", { links: "own-a" }), row("b"), row("c", { links: "own-c" })];
    const shown = applyCncGroups(rows, [{ id: "g1", partIDs: ["a", "c"], links: "group" }]);
    expect(shown.map((r) => [r.partID, r.links, r.cncGroupID ?? null])).toEqual([["a", "group", "g1"], ["c", "group", "g1"], ["b", "", null]]);
    expect(rows[0].links).toBe("own-a"); // the rows themselves keep their own links
  });
});

describe("combinedLinks and toCncGroups", () => {
  it("joins members' links without repeats", () => {
    expect(combinedLinks([row("a", { links: "x" }), row("b", { links: " x " }), row("c", { links: "y" })])).toBe("x y");
  });

  it("fills in missing fields", () => {
    expect(toCncGroups([{ id: "g" }])).toEqual([{ id: "g", partIDs: [], links: "" }]);
    expect(toCncGroups(undefined)).toEqual([]);
  });
});
