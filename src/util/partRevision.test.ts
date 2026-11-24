import { describe, expect, it } from "vitest";
import { revisionLabel, revisionTag } from "./partRevision";

describe("revisionLabel", () => {
  it("shows the server's number", () => {
    expect(revisionLabel({ revision: 3 })).toBe("3");
    expect(revisionLabel({ revision: 1, markedStandard: false, vendor: "" })).toBe("1");
  });

  it("shows an old manual text as it is", () => {
    expect(revisionLabel({ revision: " B " })).toBe("B");
  });

  it("is 1 for a made part with no revision yet (the server counts it as 1)", () => {
    expect(revisionLabel({})).toBe("1");
    expect(revisionLabel({ revision: "" })).toBe("1");
    expect(revisionLabel({ revision: null })).toBe("1");
  });

  it("is a dash for standard parts: Standard Content, marked standard or a vendor part", () => {
    expect(revisionLabel({ isStandardContent: true })).toBe("—");
    expect(revisionLabel({ markedStandard: true, revision: 2 })).toBe("—");
    expect(revisionLabel({ vendor: "McMaster" })).toBe("—");
    expect(revisionLabel({ vendor: "  " })).toBe("1");
  });

  it("is blank with no record", () => {
    expect(revisionLabel(null)).toBe("");
  });
});

describe("revisionTag", () => {
  it("is 'Rev N', or nothing for standard parts", () => {
    expect(revisionTag({ revision: 3 })).toBe("Rev 3");
    expect(revisionTag({})).toBe("Rev 1");
    expect(revisionTag({ vendor: "McMaster" })).toBe("");
  });
});
