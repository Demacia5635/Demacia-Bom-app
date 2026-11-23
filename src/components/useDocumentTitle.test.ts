import { describe, expect, it } from "vitest";
import { recordTitle } from "./useDocumentTitle";

describe("recordTitle", () => {
  it("is the catalog number, then the kind", () => {
    expect(recordTitle("BOM", "5635-25-100", "Intake")).toBe("5635-25-100 - BOM");
  });

  it("falls back to the name, and is null with neither", () => {
    expect(recordTitle("Work Order", "  ", "Robot build")).toBe("Robot build - Work Order");
    expect(recordTitle("BOM", undefined, null)).toBeNull();
  });
});
