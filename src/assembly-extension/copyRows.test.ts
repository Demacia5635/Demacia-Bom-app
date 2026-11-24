import { describe, expect, it } from "vitest";
import type AssemblyBomRow from "./AssemblyBomRow";
import { combineSameNumber, membersOf, pickRecordRow } from "./copyRows";
import { testRow } from "./testRows";

const keep = (r: AssemblyBomRow) => r;

describe("pickRecordRow", () => {
  it("prefers a copy saved in the database, then the lowest id", () => {
    const a = testRow({ id: "b-2", source: "onshape-only" });
    const b = testRow({ id: "b-9", source: "db" });
    const c = testRow({ id: "a-1", source: "onshape-only" });
    expect(pickRecordRow([a, b, c]).id).toBe("b-9");
    expect(pickRecordRow([a, c]).id).toBe("a-1");
  });
});

describe("combineSameNumber", () => {
  const spacer = (id: string, parentId: string | null, quantity: number, fields: Partial<AssemblyBomRow> = {}) =>
    testRow({ id, parentId, quantity, catalogNumber: "2714-1003", name: "Spacer", ...fields });

  it("makes one row per parent with the quantities added, using one record", () => {
    const rows = [spacer("s1", "p1", 2), spacer("s2", "p1", 3), spacer("s3", "p2", 1)];
    const out = combineSameNumber(rows, new Set(["2714-1003"]), keep);
    expect(out).toHaveLength(2);
    const [inP1, inP2] = out;
    expect(inP1).toMatchObject({ id: "s1", parentId: "p1", quantity: 5 });
    expect(membersOf(inP1).map((m) => m.id)).toEqual(["s1", "s2"]);
    // Under p2 the only copy isn't the record's: it keeps it as its copy, for Publish.
    expect(inP2).toMatchObject({ id: "s1", parentId: "p2", quantity: 1 });
    expect(membersOf(inP2).map((m) => m.id)).toEqual(["s3"]);
  });

  it("keeps edits made before combining, the first row's winning", () => {
    const rows = [
      spacer("s1", "p1", 1, { material: "PLA", modified: ["material"] }),
      spacer("s2", "p1", 1, { material: "ABS", engineer: "Dana", modified: ["material", "engineer"] }),
    ];
    const [one] = combineSameNumber(rows, new Set(["2714-1003"]), keep);
    expect(one).toMatchObject({ material: "PLA", engineer: "Dana" });
  });

  it("leaves other numbers, assemblies and bought parts alone", () => {
    const rows = [
      spacer("s1", "p1", 1),
      spacer("s2", "p1", 1),
      testRow({ id: "x", catalogNumber: "2714-2000" }),
      testRow({ id: "asm", catalogNumber: "2714-1003", name: "Spacer", isAssembly: true }),
      testRow({ id: "bought", catalogNumber: "2714-1003", name: "Spacer", vendor: "McMaster" }),
    ];
    const out = combineSameNumber(rows, new Set(["2714-1003"]), keep);
    expect(out.map((r) => r.id)).toEqual(["s1", "x", "asm", "bought"]);
  });

  it("passes each combined row through retrack (its list of edits)", () => {
    const seen: string[] = [];
    combineSameNumber([spacer("s1", "p1", 1), spacer("s2", "p1", 1)], new Set(["2714-1003"]), (r) => {
      seen.push(r.id);
      return r;
    });
    expect(seen).toEqual(["s1"]);
  });
});
