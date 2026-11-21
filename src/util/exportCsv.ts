import type { ColumnConfig, RowData } from "../components/Table";

/** A CSV field: quoted when it holds a comma, quote or line break. */
function csvField(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Downloads a CSV of a Table as shown (QW9): the rows in the order and with
 * the filter the table shows, the columns visible and in their order (from
 * the header's data-col-key). Button and image columns are left out. UTF-8
 * with a BOM and CRLF, so Excel opens it with Hebrew intact.
 */
export function downloadTableCsv<T extends RowData>(
  tableArea: HTMLElement,
  columns: ColumnConfig<T>[],
  rowOf: (tr: Element) => T | undefined,
  filename: string
): number {
  const byKey = new Map(columns.map((c) => [c.key, c] as const));
  const shownColumns = Array.from(tableArea.querySelectorAll("thead th[data-col-key]"))
    .map((th) => byKey.get(th.getAttribute("data-col-key") ?? ""))
    .filter((c): c is ColumnConfig<T> => !!c && c.type !== "button" && c.type !== "image");
  const rows = Array.from(tableArea.querySelectorAll("tbody tr[data-row-id]"))
    .map(rowOf)
    .filter((r): r is T => !!r);

  const lines = [
    shownColumns.map((c) => csvField(c.label)).join(","),
    ...rows.map((row) => shownColumns.map((c) => csvField((row as unknown as Record<string, unknown>)[c.key])).join(",")),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return rows.length;
}

/** A file name from a title: letters, digits, Hebrew, spaces, - and _ kept. */
export function safeFileName(title: string, extension: string): string {
  const base = title.replace(/[^\p{L}\p{N} _-]+/gu, " ").trim().replace(/\s+/g, " ") || "export";
  return `${base}.${extension}`;
}
