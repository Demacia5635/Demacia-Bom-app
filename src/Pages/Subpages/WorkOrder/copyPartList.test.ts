import { describe, expect, it } from "vitest";
import { partListLine, partListText } from "./copyPartList";

const LRM = "‎";

describe("partListLine", () => {
  it("is catalog number – name ×quantity, the number and quantity kept left-to-right", () => {
    expect(partListLine({ catalogNumber: "5635-25-100", name: "Bracket", quantity: 4 })).toBe(
      `${LRM}5635-25-100${LRM} – Bracket ${LRM}×4${LRM}`
    );
  });

  it("keeps a Hebrew name as it is", () => {
    expect(partListLine({ catalogNumber: "5635-25-101", name: "תושבת", quantity: 2 })).toBe(
      `${LRM}5635-25-101${LRM} – תושבת ${LRM}×2${LRM}`
    );
  });

  it("leaves out a missing catalog number or quantity", () => {
    expect(partListLine({ name: "Spacer", quantity: 3 })).toBe(`Spacer ${LRM}×3${LRM}`);
    expect(partListLine({ catalogNumber: " ", name: "Spacer" })).toBe("Spacer");
    expect(partListLine({ catalogNumber: "5635-25-102" })).toBe(`${LRM}5635-25-102${LRM} – (no name)`);
  });
});

describe("partListText", () => {
  it("starts with the title and the date (Israel time), then one line per part", () => {
    const text = partListText("Robot 2026", [{ catalogNumber: "A", name: "B", quantity: 1 }, { name: "C", quantity: 2 }], new Date("2026-11-23T23:30:00Z"));
    expect(text.split("\n")).toEqual(["Robot 2026 – 24/11/2026", `${LRM}A${LRM} – B ${LRM}×1${LRM}`, `C ${LRM}×2${LRM}`]);
  });
});
