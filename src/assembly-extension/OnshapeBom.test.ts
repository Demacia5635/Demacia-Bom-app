import { describe, expect, it } from "vitest";
import { bomFieldColumns, parseOnshapeBomTable, type OnshapeBomItem, type OnshapeBomTable } from "./OnshapeBom";

const source = (partId?: string) => ({ documentId: "d", elementId: "e", wvmId: "w", wvmType: "w", partId });
const table = (items: OnshapeBomItem[], headers: OnshapeBomTable["headers"] = []): OnshapeBomTable => ({
  id: "bom",
  name: "BOM of Robot",
  headers,
  items,
});

describe("parseOnshapeBomTable", () => {
  it("returns only top-level rows of a multi-level BOM, sub-assemblies by their children", () => {
    const rows = parseOnshapeBomTable(
      table([
        { item: "1", name: "Arm", quantity: 2, itemSource: source("P") },
        { item: "1.1", name: "Inner", itemSource: source("A") },
        { item: "1.1.2", name: "Deep", itemSource: source("B") },
        { item: "10", name: "Ten", itemSource: source("T") },
        { item: "2", name: "Plate", quantity: "3", itemSource: source("JHD") },
      ])
    );
    expect(rows.map((r) => [r.name, r.isSubassembly, r.quantity])).toEqual([
      ["Arm", true, 2],
      ["Ten", false, 1], // "10" isn't a child of "1"
      ["Plate", false, 3],
    ]);
  });

  it("finds sub-assemblies of a single-level BOM by their missing part ID", () => {
    const rows = parseOnshapeBomTable(
      table([
        { item: "1", name: "Gripper", itemSource: source(undefined) },
        { item: "2", name: "Plate", itemSource: source("JHD") },
      ])
    );
    expect(rows.map((r) => r.isSubassembly)).toEqual([true, false]);
  });

  it("reads optional columns only when the BOM has them, and material names", () => {
    const rows = parseOnshapeBomTable(
      table(
        [
          {
            item: "1",
            name: "Plate",
            partNumber: "2714-1003",
            material: { id: "m", displayName: "6061 Aluminum" },
            itemSource: source("JHD"),
          },
        ],
        [
          { name: "Part number", propertyName: "partNumber", visible: true, propertyId: "x" },
          { name: "Material", propertyName: "material", visible: true, propertyId: "y" },
        ]
      )
    );
    expect(rows[0].onshapeFields).toEqual({ partNumber: "2714-1003", material: "6061 Aluminum" });
    expect(rows[0].material).toBe("6061 Aluminum");
  });

  it("copes with a table without items", () => {
    expect(parseOnshapeBomTable({ id: "x", name: "BOM", headers: [] } as unknown as OnshapeBomTable)).toEqual([]);
  });
});

describe("bomFieldColumns", () => {
  it("finds the engineer column by its property ID", () => {
    const cols = bomFieldColumns(table([], [{ name: "Engineer", propertyName: "eng", visible: true, propertyId: "57f3fb8efa3416c06701d619" }]));
    expect(cols.get("engineer")).toBe("eng");
    expect(cols.has("price")).toBe(false);
  });
});
