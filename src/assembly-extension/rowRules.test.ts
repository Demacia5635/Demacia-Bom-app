import { describe, expect, it } from "vitest";
import { hasNoRevision, revisionChange, revisionLabel } from "./rowRules";
import { testRow } from "./testRows";

describe("hasNoRevision", () => {
  it("is true for Standard Content, marked standard and vendor parts, like the server", () => {
    expect(hasNoRevision({ isStandardContent: true })).toBe(true);
    expect(hasNoRevision({ markedStandard: true })).toBe(true);
    expect(hasNoRevision({ vendor: "McMaster" })).toBe(true);
    expect(hasNoRevision({ vendor: "  " })).toBe(false);
    expect(hasNoRevision({ vendor: "" })).toBe(false);
  });
});

describe("revisionLabel", () => {
  it("shows the server's number, none for standard parts, new for unsaved ones", () => {
    expect(revisionLabel({ revision: 3 }, false)).toBe("3");
    expect(revisionLabel({ revision: 3 }, true)).toBe("—");
    expect(revisionLabel(null, false)).toBe("new");
    expect(revisionLabel(null, true)).toBe("—");
  });

  it("counts a saved part without a number as 1, and shows an old text value as it is", () => {
    expect(revisionLabel({}, false)).toBe("1");
    expect(revisionLabel({ revision: "" }, false)).toBe("1");
    expect(revisionLabel({ revision: "B" }, false)).toBe("B");
  });
});

describe("revisionChange", () => {
  const saved = (fields: Parameters<typeof testRow>[0]) =>
    testRow({ source: "db", revision: "3", modified: ["material"], baseline: {}, ...fields });

  it("says the next number for an edited saved part", () => {
    expect(revisionChange(saved({}))).toEqual({ from: "3", to: "4 (if its saved data changes)" });
    expect(revisionChange(saved({ revision: "B" }))).toEqual({ from: "B", to: "next (if its saved data changes)" });
  });

  it("says nothing for unedited, unsaved, standard parts and assemblies", () => {
    expect(revisionChange(saved({ modified: [] }))).toBeNull();
    expect(revisionChange(saved({ source: "onshape-only" }))).toBeNull();
    expect(revisionChange(saved({ markedStandard: true }))).toBeNull();
    expect(revisionChange(saved({ vendor: "McMaster" }))).toBeNull();
    expect(revisionChange(saved({ isStandardContent: true }))).toBeNull();
    expect(revisionChange(saved({ isAssembly: true }))).toBeNull();
  });

  it("says a part unmarked as standard starts again at 1", () => {
    // The baseline keeps the standard mark as a boolean (typed as text / numbers).
    const baseline = { markedStandard: true } as unknown as Record<string, string | number>;
    expect(revisionChange(saved({ revision: "—", modified: ["markedStandard"], baseline }))).toEqual({
      from: "—",
      to: "1",
    });
  });
});
