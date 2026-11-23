import { useEffect, useState, type MouseEvent } from "react";

export interface RowContextMenu<Row> {
  x: number;
  y: number;
  row: Row;
  /** The column of the cell right-clicked (its data-col-key), if any. */
  colKey?: string;
}

/**
 * A page's own right-click menu on Table rows (the BOM and work-order pages):
 * `openFor` goes on the table's onContextMenuCapture, and a click anywhere
 * closes the menu. On a merged cell (rowSpan, e.g. a CNC job's Links) the menu
 * is for the row at the height clicked, not the group's first row.
 */
export function useRowContextMenu<Row>() {
  const [menu, setMenu] = useState<RowContextMenu<Row> | null>(null);

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  /** `rowOf` finds the row a <tr> shows (by the data-row-id Table puts on it). */
  const openFor = (e: MouseEvent<HTMLElement>, rowOf: (tr: Element) => Row | undefined) => {
    const target = e.target as HTMLElement;
    let rowEl = target.closest(".table-tr, tr");
    if (!rowEl) return;

    e.preventDefault();
    e.stopPropagation();

    const mergedCell = target.closest("td[rowspan]");
    if (mergedCell && rowEl.contains(mergedCell)) {
      let tr: Element | null = rowEl;
      for (let i = 0; tr && i < (mergedCell as HTMLTableCellElement).rowSpan; i++, tr = tr.nextElementSibling) {
        const box = tr.getBoundingClientRect();
        if (e.clientY >= box.top && e.clientY < box.bottom) {
          rowEl = tr;
          break;
        }
      }
    }

    const row = rowOf(rowEl);
    const colKey = target.closest("[data-col-key]")?.getAttribute("data-col-key") ?? undefined;
    if (row) setMenu({ x: e.clientX, y: e.clientY, row, colKey });
  };

  return { menu, openFor, close: () => setMenu(null) };
}
