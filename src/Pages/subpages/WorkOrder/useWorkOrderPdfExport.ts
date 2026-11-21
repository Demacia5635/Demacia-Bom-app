import { useRef, useState } from "react";
import { printPartsPdf } from "../../../util/exportPartsPdf";
import type WorkOrderTableRow from "./WorkOrderTableRow";

interface PdfExportOptions {
  /** The row a table <tr> shows. */
  rowFromElement: (tr: Element) => WorkOrderTableRow | undefined;
  title: string;
  /** The assembly's name, when known. */
  assemblyName?: string;
  /** The active filters in words (none: "All parts"). */
  filterLines: string[];
}

/**
 * Exports the work-order parts the table shows (filtered and in its sort
 * order: image, name, catalog number, quantity) to a PDF. Put `tableAreaRef`
 * on the element around the table; `pdfProgress` is null when idle.
 */
export function useWorkOrderPdfExport({ rowFromElement, title, assemblyName, filterLines }: PdfExportOptions) {
  const tableAreaRef = useRef<HTMLDivElement>(null);
  /** null when idle; otherwise images loaded so far. */
  const [pdfProgress, setPdfProgress] = useState<{ loaded: number; total: number } | null>(null);

  const exportPdf = async () => {
    // The rows as the table shows them: filtered and in its sort order.
    const shownRows = Array.from(tableAreaRef.current?.querySelectorAll("tr[data-row-id]") ?? [])
      .map(rowFromElement)
      .filter((r): r is WorkOrderTableRow => !!r);
    if (shownRows.length === 0) {
      window.alert("No parts are shown, so there's nothing to export.");
      return;
    }

    setPdfProgress({ loaded: 0, total: 0 });
    try {
      await printPartsPdf({
        title,
        subtitleLines: [
          assemblyName ? `Assembly: ${assemblyName}` : "",
          filterLines.length > 0 ? `Filters: ${filterLines.join(" · ")}` : "All parts",
          `Exported ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Jerusalem" })}`,
        ],
        rows: shownRows.map((r) => ({
          name: r.name,
          catalogNumber: r.catalogNumber,
          quantity: r.quantityTotal,
          imageSrc: r.avatar,
        })),
        onProgress: (loaded, total) => setPdfProgress({ loaded, total }),
      });
    } catch (err: any) {
      console.error("PDF export failed:", err);
      window.alert(`Couldn't export the PDF: ${err?.message || err}`);
    } finally {
      setPdfProgress(null);
    }
  };

  return { tableAreaRef, pdfProgress, exportPdf };
}
