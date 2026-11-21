import { describe, expect, it } from "vitest";
import { filterMatches, groupChildren, mergedCellSpans, renderKeys, sortSiblings, visibleRows } from "./visibleRows";
import type { ColumnConfig } from "../Table";

const data = [
  { id: "a", parentId: null, isExpanded: true, name: "B", g: "x" },
  { id: "b", parentId: "a", isExpanded: false, name: "z", g: "x" },
  { id: "c", parentId: "a", isExpanded: false, name: "y", g: "" },
  { id: "d", parentId: null, isExpanded: false, name: "A", g: "" },
  { id: "e", parentId: "d", isExpanded: false, name: "q", g: "" },
];
const shown = (rows: { id: string; level: number; open: boolean }[]) => rows.map((r) => `${r.id}@${r.level}${r.open ? "+" : ""}`).join(" ");

describe("visibleRows", () => {
  const kids = groupChildren(data);

  it("shows expanded parents' children, in data order", () => {
    expect(shown(visibleRows(kids, null, null, undefined))).toBe("a@0+ b@1 c@1 d@0");
  });

  it("sorts siblings by the sort column", () => {
    expect(shown(visibleRows(kids, { key: "name", direction: "asc" }, null, undefined))).toBe("d@0 a@0+ c@1 b@1");
  });

  it("opens the parents of a filter match, whatever their expand state", () => {
    expect(shown(visibleRows(kids, null, filterMatches(data, (r) => r.id === "e"), undefined))).toBe("d@0+ e@1");
  });

  it("leaves out hidden rows and what's under them", () => {
    expect(shown(visibleRows(kids, null, null, (r) => r.id === "a"))).toBe("d@0");
  });
});

describe("sortSiblings", () => {
  it("puts empty values last in both directions and compares numbers as numbers", () => {
    const rows = [{ id: "1", parentId: null, isExpanded: false, v: 10 }, { id: "2", parentId: null, isExpanded: false, v: undefined }, { id: "3", parentId: null, isExpanded: false, v: "9" }];
    expect(sortSiblings(rows, { key: "v", direction: "asc" }).map((r) => r.id)).toEqual(["3", "1", "2"]);
    expect(sortSiblings(rows, { key: "v", direction: "desc" }).map((r) => r.id)).toEqual(["1", "3", "2"]);
  });
});

describe("mergedCellSpans and renderKeys", () => {
  it("merges neighbouring rows with the same key", () => {
    const rows = visibleRows(groupChildren(data), null, null, undefined);
    const columns = [{ key: "g", label: "G", type: "string", mergeKey: (r: { g: string }) => r.g }] as ColumnConfig[];
    expect([...mergedCellSpans(columns, rows)]).toEqual([["g", [2, 0, 1, 1]]]);
  });

  it("keys repeated ids under one parent apart", () => {
    const rows = visibleRows(groupChildren([...data.slice(0, 2), { ...data[1] }]), null, null, undefined);
    expect([...renderKeys(rows).values()]).toEqual([">a", "a>b", "a>b#1"]);
  });
});
