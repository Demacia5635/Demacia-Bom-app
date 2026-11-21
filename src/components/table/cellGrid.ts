/**
 * Excel-style cell ranges for Table (opt-in `cellSelection`): the clipboard's
 * tab-separated text, and turning pasted text into a column's value. Pure
 * functions, so they can be tested.
 */
import type { CellValue, ColumnConfig } from "../Table";

/** A cell by its shown row and column index. */
export interface CellPos {
  row: number;
  col: number;
}

/** A rectangle of cells, corners included. */
export interface CellRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export function rangeOf(a: CellPos, b: CellPos): CellRange {
  return {
    top: Math.min(a.row, b.row),
    bottom: Math.max(a.row, b.row),
    left: Math.min(a.col, b.col),
    right: Math.max(a.col, b.col),
  };
}

export const rangeSize = (r: CellRange) => (r.bottom - r.top + 1) * (r.right - r.left + 1);

export const inRange = (r: CellRange, row: number, col: number) =>
  row >= r.top && row <= r.bottom && col >= r.left && col <= r.right;

/** Clipboard text as rows of cells (Excel copies rows as lines, cells split by tabs). */
export function parseClipboardGrid(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop(); // Excel ends with a newline
  return lines.map((line) => line.split("\t"));
}

/** Cells as clipboard text: tabs between cells, newlines between rows. */
export function formatClipboardGrid(grid: string[][]): string {
  return grid.map((cells) => cells.map((c) => c.replace(/[\t\n\r]+/g, " ")).join("\t")).join("\n");
}

/** A cell's value as copied text (ticks as TRUE / FALSE, like Excel). */
export function cellText(col: ColumnConfig, value: unknown): string {
  if (col.type === "boolean") return value ? "TRUE" : "FALSE";
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * Pasted / filled text as the value for `col`, or undefined when it doesn't
 * fit (the cell is left as it is): numbers like the table's own check, ticks
 * from TRUE/FALSE, yes/no, 1/0, x; a select only one of its options.
 */
export function valueFromText(col: ColumnConfig, text: string): CellValue | undefined {
  const t = text.trim();
  switch (col.type) {
    case "boolean": {
      const v = t.toLowerCase();
      if (["true", "yes", "1", "x", "✓", "v"].includes(v)) return true;
      if (["false", "no", "0", ""].includes(v)) return false;
      return undefined;
    }
    case "number": {
      if (t === "") return "0";
      if (col.key === "quantity" || col.key === "revision") return /^\d+$/.test(t) ? String(parseInt(t, 10)) : undefined;
      return /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? String(Number(t)) : undefined;
    }
    case "select":
      return col.options?.includes(t) ? t : undefined;
    case "string":
      return text;
    default:
      return undefined; // buttons and pictures aren't values
  }
}
