import { describe, expect, it } from "vitest";
import { fieldLabel, formatBytes } from "./filesData";

describe("formatBytes", () => {
  it("picks a unit", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(14_020_000)).toBe("13.4 MB");
    expect(formatBytes(250 * 1024 * 1024)).toBe("250 MB");
  });
});

describe("fieldLabel", () => {
  it("names the file kind", () => {
    expect(fieldLabel("avatarID")).toBe("Image");
    expect(fieldLabel("wantParasolid")).toBe("Parasolid");
    expect(fieldLabel("stlLink")).toBe("STL");
  });
});
