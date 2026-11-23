import { describe, expect, it } from "vitest";
import type { ColumnConfig, RowData } from "../Table";
import { cellText, formatClipboardGrid, parseClipboardGrid, rangeOf, rangeSize, valueFromText } from "./cellGrid";

type Row = RowData & { kind?: string };
const col = (c: Partial<ColumnConfig<Row>> & Pick<ColumnConfig<Row>, "type">): ColumnConfig<Row> =>
  ({ key: "k", label: "K", ...c }) as ColumnConfig<Row>;

describe("clipboard grid", () => {
  it("reads Excel's copy: rows by line, cells by tab, the last newline dropped", () => {
    expect(parseClipboardGrid("a\tb\r\nc\td\r\n")).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseClipboardGrid("one")).toEqual([["one"]]);
  });

  it("writes tabs and newlines, flattening ones inside a cell", () => {
    expect(formatClipboardGrid([["a", "b\tc"], ["d", "e"]])).toBe("a\tb c\nd\te");
  });

  it("copies ticks as TRUE / FALSE and empty values as nothing", () => {
    expect(cellText(col({ type: "boolean" }), true)).toBe("TRUE");
    expect(cellText(col({ type: "string" }), undefined)).toBe("");
  });

  it("measures a range from any two corners", () => {
    expect(rangeSize(rangeOf({ row: 3, col: 1 }, { row: 1, col: 2 }))).toBe(6);
  });
});

describe("valueFromText", () => {
  it("accepts numbers the table accepts, and leaves the cell for anything else", () => {
    const price = col({ key: "price", type: "number" });
    expect(valueFromText(price, " 1.5 ")).toBe("1.5");
    expect(valueFromText(price, "1,5")).toBeUndefined();
    expect(valueFromText(price, "")).toBe("0");
    const qty = col({ key: "quantity", type: "number" });
    expect(valueFromText(qty, "3")).toBe("3");
    expect(valueFromText(qty, "3.2")).toBeUndefined();
  });

  it("reads ticks from TRUE/FALSE, yes/no, 1/0", () => {
    const tick = col({ type: "boolean" });
    expect(valueFromText(tick, "TRUE")).toBe(true);
    expect(valueFromText(tick, "no")).toBe(false);
    expect(valueFromText(tick, "maybe")).toBeUndefined();
  });

  it("keeps a select to its options", () => {
    const status = col({ type: "select", options: ["A", "B"] });
    expect(valueFromText(status, "B")).toBe("B");
    expect(valueFromText(status, "C")).toBeUndefined();
  });

  it("uses the row's own options when the column has rowOptions", () => {
    const status = col({
      type: "select",
      options: ["A", "B"],
      rowOptions: (row) => (row.kind === "bought" ? ["Ordered", "Arrived"] : ["A", "B"]),
    });
    const bought = { id: "1", kind: "bought" } as Row;
    const made = { id: "2", kind: "made" } as Row;
    expect(valueFromText(status, "Arrived", bought)).toBe("Arrived");
    expect(valueFromText(status, "A", bought)).toBeUndefined();
    expect(valueFromText(status, "Arrived", made)).toBeUndefined();
  });

  it("keeps text as typed, and ignores buttons and pictures", () => {
    expect(valueFromText(col({ type: "string" }), " keep spaces ")).toBe(" keep spaces ");
    expect(valueFromText(col({ type: "button" }), "x")).toBeUndefined();
    expect(valueFromText(col({ type: "image" }), "x")).toBeUndefined();
  });
});
