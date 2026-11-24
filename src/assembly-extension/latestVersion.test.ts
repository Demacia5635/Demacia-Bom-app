import { describe, expect, it } from "vitest";
import { compareVersions } from "./latestVersion";

describe("compareVersions", () => {
  it("compares each part as a number", () => {
    expect(compareVersions("5.0.1", "5.0.0")).toBeGreaterThan(0);
    expect(compareVersions("5.10.0", "5.9.9")).toBeGreaterThan(0);
    expect(compareVersions("4.9.9", "5.0.0")).toBeLessThan(0);
    expect(compareVersions("5.0.0", "5.0.0")).toBe(0);
  });

  it("treats missing parts as 0", () => {
    expect(compareVersions("5.1", "5.1.0")).toBe(0);
    expect(compareVersions("6", "5.9.9")).toBeGreaterThan(0);
  });
});
