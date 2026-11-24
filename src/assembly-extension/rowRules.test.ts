import { describe, expect, it } from "vitest";
import { revisionLabel } from "./rowRules";

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
