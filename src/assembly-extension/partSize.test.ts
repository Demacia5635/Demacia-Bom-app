import { describe, expect, it, vi } from "vitest";

// readPartSize asks Onshape for the bounding box: stand in for that call.
const getPartBoundingBox = vi.fn();
vi.mock("../extension/onshapeDirect", () => ({ getPartBoundingBox: (...a: unknown[]) => getPartBoundingBox(...a) }));

const { isSavedSizeStale, needsSize, readPartSize } = await import("./partSize");
const { testRow } = await import("./testRows");

describe("needsSize", () => {
  it("is for made parts only", () => {
    expect(needsSize(testRow())).toBe(true);
    expect(needsSize(testRow({ isAssembly: true }))).toBe(false);
    expect(needsSize(testRow({ isStandardContent: true }))).toBe(false);
    expect(needsSize(testRow({ vendor: "McMaster" }))).toBe(false);
    expect(needsSize(testRow({ entityID: "" }))).toBe(false);
  });
});

describe("isSavedSizeStale", () => {
  it("is stale only when the model changed since the size was read", () => {
    expect(isSavedSizeStale(testRow({ sizeVersion: "v1" }), "v2")).toBe(true);
    expect(isSavedSizeStale(testRow({ sizeVersion: "v1" }), "v1")).toBe(false);
    expect(isSavedSizeStale(testRow({ sizeVersion: "v1" }), null)).toBe(false); // version unknown: keep it
    expect(isSavedSizeStale(testRow(), "v2")).toBe(false); // read just now (no version)
  });
});

describe("readPartSize", () => {
  it("formats Onshape's bounding box", async () => {
    getPartBoundingBox.mockResolvedValueOnce({ lowX: 0, lowY: 0, lowZ: 0, highX: 0.008, highY: 0.025, highZ: 0.006 });
    await expect(readPartSize(testRow())).resolves.toBe("25 × 8 × 6 mm");
  });

  it("asks nothing once cancelled", async () => {
    getPartBoundingBox.mockClear();
    await expect(readPartSize(testRow(), () => true)).rejects.toMatchObject({ cancelled: true });
    expect(getPartBoundingBox).not.toHaveBeenCalled();
  });

  it("passes on errors other than rate limiting", async () => {
    getPartBoundingBox.mockRejectedValueOnce({ onshapeStatus: 404, message: "gone" });
    await expect(readPartSize(testRow())).rejects.toMatchObject({ onshapeStatus: 404 });
  });
});
