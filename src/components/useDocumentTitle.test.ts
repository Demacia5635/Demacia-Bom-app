import { describe, expect, it } from "vitest";
import { recordTitle } from "./useDocumentTitle";

describe("recordTitle", () => {
  it("is the name, then the kind", () => {
    expect(recordTitle("BOM", "chassis", "5635-25-100")).toBe("chassis - BOM");
    expect(recordTitle("Work Order", "chassis", "5635-25-100")).toBe("chassis - Work Order");
  });

  it("falls back to the catalog number, and is null with neither", () => {
    expect(recordTitle("BOM", "  ", "5635-25-100")).toBe("5635-25-100 - BOM");
    expect(recordTitle("Work Order", undefined, null)).toBeNull();
  });
});
