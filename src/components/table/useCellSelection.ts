/**
 * Excel-style cell selection for Table, when its `cellSelection` prop is on
 * (off: nothing here runs, and the table behaves as before):
 *  - drag across cells, or Shift-click, selects a rectangle;
 *  - Ctrl+C copies it as tab-separated text (pastes into Excel), Ctrl+V pastes
 *    such text from its top-left cell (one value fills the whole selection),
 *    Ctrl+D fills each column down from the selection's top row (one row:
 *    from the row above), Delete clears its text cells;
 *  - Esc or a click outside the table clears it (except on an element marked
 *    data-keep-cell-selection, e.g. a page's bar that edits the selection);
 *  - keys and copy / paste typed into another field of the page are left alone.
 * Every change is one setData (one undo step); locked (disabled) cells,
 * buttons and pictures are skipped, and text that doesn't fit a column
 * (letters in a number cell...) leaves that cell as it was.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from "react";
import type { CellValue, ColumnConfig, RowData } from "../Table";
import {
  cellText,
  formatClipboardGrid,
  inRange,
  parseClipboardGrid,
  rangeOf,
  rangeSize,
  valueFromText,
  type CellPos,
  type CellRange,
} from "./cellGrid";

interface Options<T extends RowData> {
  enabled: boolean;
  /** The rows as shown (sorted, filtered), by their index. */
  rows: T[];
  columns: ColumnConfig<T>[];
  data: T[];
  setData: (data: T[]) => void;
  wrapperRef: RefObject<HTMLDivElement | null>;
  /** The distinct rows the selection covers (by id), whenever it changes. */
  onSelectionChange?: (rows: T[]) => void;
}

const valueOf = (row: RowData, key: string): unknown => (row as unknown as Record<string, unknown>)[key];

/** A text field, select or editable element (where keys and paste belong to it). */
function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function useCellSelection<T extends RowData>({ enabled, rows, columns, data, setData, wrapperRef, onSelectionChange }: Options<T>) {
  const [anchor, setAnchor] = useState<CellPos | null>(null);
  const [focus, setFocus] = useState<CellPos | null>(null);
  const dragging = useRef(false);
  const range: CellRange | null = enabled && anchor && focus ? rangeOf(anchor, focus) : null;
  /** More than one cell: the selection is shown and the keys act on it. */
  const multi = !!range && rangeSize(range) > 1;

  const clear = useCallback(() => {
    setAnchor(null);
    setFocus(null);
  }, []);

  // The rows covered, for the page (e.g. an "N selected" bar).
  const selectedRows = useMemo(() => {
    if (!range) return [];
    const seen = new Set<string>();
    const out: T[] = [];
    for (let r = range.top; r <= range.bottom; r++) {
      const row = rows[r];
      if (row && !seen.has(row.id)) {
        seen.add(row.id);
        out.push(row);
      }
    }
    return out;
  }, [range?.top, range?.bottom, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (enabled) onSelectionChange?.(selectedRows);
  }, [enabled, selectedRows, onSelectionChange]);

  const onCellMouseDown = useCallback(
    (e: MouseEvent, row: number, col: number) => {
      if (e.button !== 0) return;
      if (e.shiftKey && anchor) {
        e.preventDefault(); // keep the selection: don't start editing the clicked cell
        setFocus({ row, col });
        (document.activeElement as HTMLElement | null)?.blur?.();
        return;
      }
      dragging.current = true;
      setAnchor({ row, col });
      setFocus({ row, col });
    },
    [anchor]
  );

  /** A cell's text box got the focus (click or arrow keys): it's the selection start. */
  const onCellFocus = useCallback((row: number, col: number) => {
    if (dragging.current) return;
    setAnchor({ row, col });
    setFocus({ row, col });
  }, []);

  const onCellMouseEnter = useCallback((row: number, col: number) => {
    if (!dragging.current) return;
    setFocus((prev) => (prev && prev.row === row && prev.col === col ? prev : { row, col }));
    // Selecting cells, not text: leave the cell being edited.
    (document.activeElement as HTMLElement | null)?.blur?.();
    window.getSelection()?.removeAllRanges();
  }, []);

  /** Applies text to cells: `textAt(row, col)` for each cell of `target` (undefined: leave it). */
  const writeCells = useCallback(
    (target: CellRange, textAt: (r: number, c: number) => string | undefined) => {
      const updates = new Map<string, Record<string, CellValue>>();
      for (let r = target.top; r <= target.bottom; r++) {
        const row = rows[r];
        if (!row) continue;
        for (let c = target.left; c <= target.right; c++) {
          const col = columns[c];
          if (!col || col.isDisabled?.(row)) continue;
          const text = textAt(r, c);
          if (text === undefined) continue;
          const value = valueFromText(col, text, row);
          if (value === undefined) continue;
          updates.set(row.id, { ...(updates.get(row.id) ?? {}), [col.key]: value });
        }
      }
      if (updates.size === 0) return;
      // Like an edit in one cell, every row with that id (each use of the item) changes.
      setData(data.map((row) => (updates.has(row.id) ? { ...row, ...updates.get(row.id) } : row)));
    },
    [rows, columns, data, setData]
  );

  useEffect(() => {
    if (!enabled) return;
    const onMouseUp = () => {
      dragging.current = false;
    };
    const onPointerDownOutside = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (wrapperRef.current?.contains(target) || target?.closest?.("[data-keep-cell-selection]")) return;
      clear();
    };
    /** In a field elsewhere on the page (not one of the table's cells). */
    const elsewhere = (e: Event) => isEditable(e.target) && !wrapperRef.current?.contains(e.target as Node);
    const onKeyDown = (e: KeyboardEvent) => {
      if (!range || elsewhere(e)) return;
      if (e.key === "Escape" && multi) {
        clear();
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "d" && !e.altKey) {
        // Fill down (Chrome's Ctrl+D would bookmark the page).
        e.preventDefault();
        const from = range.bottom > range.top ? range.top : range.top - 1;
        if (from < 0) return;
        const target = range.bottom > range.top ? { ...range, top: range.top + 1 } : range;
        writeCells(target, (_r, c) => {
          const col = columns[c];
          const source = rows[from];
          return col && source ? cellText(col, valueOf(source, col.key)) : undefined;
        });
      } else if (multi && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        writeCells(range, (_r, c) => (columns[c]?.type === "string" ? "" : undefined));
      }
    };
    const onCopy = (e: ClipboardEvent) => {
      if (!range || !multi || elsewhere(e)) return; // one cell: the browser copies the text box's text
      const grid: string[][] = [];
      for (let r = range.top; r <= range.bottom; r++) {
        const row = rows[r];
        const cells: string[] = [];
        for (let c = range.left; c <= range.right; c++) {
          const col = columns[c];
          cells.push(row && col ? cellText(col, valueOf(row, col.key)) : "");
        }
        grid.push(cells);
      }
      e.clipboardData?.setData("text/plain", formatClipboardGrid(grid));
      e.preventDefault();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!range || elsewhere(e)) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      const grid = parseClipboardGrid(text);
      const one = grid.length === 1 && grid[0].length === 1;
      // One cell and one value: the text box pastes it as usual.
      if (!multi && one) return;
      e.preventDefault();
      if (one) {
        writeCells(range, () => grid[0][0]); // one value fills the selection
      } else {
        const target = {
          top: range.top,
          left: range.left,
          bottom: range.top + grid.length - 1,
          right: range.left + Math.max(...grid.map((g) => g.length)) - 1,
        };
        writeCells(target, (r, c) => grid[r - range.top]?.[c - range.left]);
        setFocus({ row: target.bottom, col: target.right });
      }
    };
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("pointerdown", onPointerDownOutside, true);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("pointerdown", onPointerDownOutside, true);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [enabled, range, multi, rows, columns, writeCells, clear, wrapperRef]);

  return {
    /** Shown as selected (only a selection of more than one cell is drawn). */
    isSelected: (row: number, col: number) => multi && !!range && inRange(range, row, col),
    onCellMouseDown: enabled ? onCellMouseDown : undefined,
    onCellMouseEnter: enabled ? onCellMouseEnter : undefined,
    onCellFocus: enabled ? onCellFocus : undefined,
  };
}
