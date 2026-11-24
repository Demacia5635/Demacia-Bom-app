/**
 * Test helper (used only by *.test.ts): a panel row with sensible defaults,
 * so a test only spells out what it's about.
 */
import type AssemblyBomRow from "./AssemblyBomRow";

let next = 1;

export function testRow(fields: Partial<AssemblyBomRow> = {}): AssemblyBomRow {
  const id = fields.id ?? `row-${next++}`;
  return {
    id,
    parentId: null,
    isExpanded: false,
    source: "onshape-only",
    isAssembly: false,
    name: "Plate",
    catalogNumber: "",
    revision: "",
    description: "",
    engineer: "",
    material: "",
    mass: 0,
    price: 0,
    quantity: 1,
    comments: "",
    avatar: "",
    documentID: "d".repeat(24),
    wvmType: "w",
    wvmID: "w".repeat(24),
    elementID: "e".repeat(24),
    entityID: "JHD",
    onshapeURL: "",
    exportSTL: "",
    exportParasolid: "",
    vendor: "",
    ...fields,
  } as AssemblyBomRow;
}
