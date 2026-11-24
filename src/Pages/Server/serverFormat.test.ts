import { describe, expect, it } from "vitest";
import { formatUptime, jobCounts, maskIp } from "./serverFormat";

describe("formatUptime", () => {
  it("is minutes, hours or days", () => {
    expect(formatUptime(300)).toBe("5 min");
    expect(formatUptime(3 * 3600 + 120)).toBe("3 h 2 min");
    expect(formatUptime(2 * 86400 + 5 * 3600)).toBe("2 d 5 h");
    expect(formatUptime(undefined)).toBe("—");
  });
});

describe("maskIp", () => {
  it("hides the last part of an address", () => {
    expect(maskIp("192.168.1.23")).toBe("192.168.1.•");
    expect(maskIp("2001:db8:85a3:0:0:8a2e:370:7334")).toBe("2001:db8:85a3:0:…");
  });
});

describe("jobCounts", () => {
  it("lists numbers and sums reason objects", () => {
    expect(jobCounts({ moved: 300, alreadyInPlace: 150, skipped: { "not found in Drive": 3, "in Drive's trash": 2 }, foldersCreated: 0, note: "x" })).toBe(
      "moved 300 · already in place 150 · skipped 5 · folders created 0"
    );
    expect(jobCounts(null)).toBe("");
  });
});
