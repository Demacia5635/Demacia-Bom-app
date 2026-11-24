import { describe, expect, it } from "vitest";
import { revisionLabel, revisionTag } from "./partRevision";

describe("revisionLabel", () => {
  it("shows the server's number", () => {
    expect(revisionLabel({ revision: 3 })).toBe("3");
    expect(revisionLabel({ revision: 1, markedStandard: false })).toBe("1");
  });

  it("shows an old manual text as it is", () => {
    expect(revisionLabel({ revision: " B " })).toBe("B");
  });

  it("is a dash for standard parts without one, blank otherwise", () => {
    expect(revisionLabel({ isStandardContent: true })).toBe("—");
    expect(revisionLabel({ markedStandard: true, revision: "" })).toBe("—");
    expect(revisionLabel({})).toBe("");
    expect(revisionLabel(null)).toBe("");
  });
});

describe("revisionTag", () => {
  it("is 'Rev N', or nothing for standard parts and parts without one", () => {
    expect(revisionTag({ revision: 3 })).toBe("Rev 3");
    expect(revisionTag({ isStandardContent: true })).toBe("");
    expect(revisionTag({})).toBe("");
  });
});
