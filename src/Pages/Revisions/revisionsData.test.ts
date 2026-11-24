import { describe, expect, it } from "vitest";
import { changedFields, revisionChange, severity, withinDays, type RevisionItem } from "./revisionsData";

const item = (openWorkOrders: RevisionItem["openWorkOrders"], details: Record<string, unknown> = { from: 3, to: 4, fields: ["material", "mass"] }): RevisionItem => ({
  event: { id: "e1", at: "2026-11-24T10:00:00Z", kind: "part.revision", message: "m", details },
  part: { id: "p1", name: "Bracket", revisionNow: 4 },
  openWorkOrders,
});

describe("severity", () => {
  it("flags EVERY part in an open work order, whatever its status (no false negatives)", () => {
    for (const status of ["CATNUM Written", "In Planning", "Manufacturing approved", "Untracked", "To buy", "", undefined]) {
      expect(severity(item([{ id: "w1", status }]))).not.toBe("none");
    }
  });

  it("is high when it's already being made, made or bought in any of them", () => {
    expect(severity(item([{ id: "w1", status: "In Planning" }, { id: "w2", status: "In manufacturing" }]))).toBe("high");
    expect(severity(item([{ id: "w1", status: "Finished Manufacturing" }]))).toBe("high");
    expect(severity(item([{ id: "w1", status: "Finished" }]))).toBe("high");
    expect(severity(item([{ id: "w1", status: "In Planning" }]))).toBe("flag");
  });

  it("is none only when no open work order has the part", () => {
    expect(severity(item([]))).toBe("none");
  });
});

describe("revisionChange / changedFields", () => {
  it("reads the event's details", () => {
    expect(revisionChange(item([]))).toBe("rev 3 → 4");
    expect(changedFields(item([]))).toEqual(["material", "mass"]);
    expect(revisionChange(item([], {}))).toBe("rev 4");
    expect(changedFields(item([], {}))).toEqual([]);
  });
});

describe("withinDays", () => {
  const now = new Date("2026-11-24T12:00:00Z").getTime();
  it("keeps events in the range", () => {
    expect(withinDays("2026-11-20T12:00:00Z", 7, now)).toBe(true);
    expect(withinDays("2026-11-10T12:00:00Z", 7, now)).toBe(false);
    expect(withinDays("2020-01-01T00:00:00Z", null, now)).toBe(true);
  });
});
