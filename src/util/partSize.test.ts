import { describe, expect, it } from "vitest";
import { formatPartSize } from "./partSize";

describe("formatPartSize", () => {
  it("shows the box in mm, longest side first", () => {
    expect(formatPartSize({ lowX: 0, lowY: 0, lowZ: 0, highX: 0.008, highY: 0.025, highZ: 0.006 })).toBe("25 × 8 × 6 mm");
  });

  it("rounds to one decimal and ignores the box's orientation", () => {
    expect(formatPartSize({ lowX: 0.01, lowY: -0.005, lowZ: 0, highX: 0, highY: 0.00124, highZ: 0.1 })).toBe("100 × 10 × 6.2 mm");
  });

  it("is empty for a missing or empty box", () => {
    expect(formatPartSize(null)).toBe("");
    expect(formatPartSize({ lowX: 0, lowY: 0, lowZ: 0, highX: 0, highY: 0, highZ: 0 })).toBe("");
    expect(formatPartSize({ lowX: 0, lowY: 0, lowZ: 0, highX: NaN, highY: 1, highZ: 1 })).toBe("");
  });
});
