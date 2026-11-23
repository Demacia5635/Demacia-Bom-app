import { fetchImageBlob } from "./ApiService";

/** One line of the exported parts list. */
export interface PdfPartRow {
    name: string;
    catalogNumber?: string;
    quantity: number | string;
    /** Bounding box from Onshape (e.g. "25 × 8 × 8 mm"); "" when unknown. */
    size?: string;
    /** A record image src (see recordImageSrc); "" for none. */
    imageSrc: string;
}

export interface PartsPdfOptions {
    /** Big heading, e.g. the work order's name. Also the suggested PDF file name. */
    title: string;
    /** Smaller lines under the heading (assembly, filters...). Empty ones are skipped. */
    subtitleLines?: string[];
    rows: PdfPartRow[];
    /** Called as images load, to show progress. */
    onProgress?: (loaded: number, total: number) => void;
}

/** Images are shrunk to this many pixels on their long side: sharp in print, small in the PDF. */
const IMAGE_MAX_PX = 320;
/** Images loaded at once. */
const IMAGE_CONCURRENCY = 6;
/** Longest the print frame waits for its images to load. */
const IMAGE_LOAD_TIMEOUT_MS = 10000;

const escapeHtml = (text: string) =>
    text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The image as a small JPEG data: URL (white behind transparent parts), or "" if it can't be loaded. */
async function thumbnailDataUrl(src: string): Promise<string> {
    if (!src) return "";
    try {
        const bitmap = await createImageBitmap(await fetchImageBlob(src));
        // Closed however drawing ends (no canvas context, a drawing error), to free its memory.
        try {
            const scale = Math.min(1, IMAGE_MAX_PX / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            const ctx = canvas.getContext("2d");
            if (!ctx) return "";
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL("image/jpeg", 0.85);
        } finally {
            bitmap.close();
        }
    } catch (err) {
        console.warn("PDF export: image not loaded", src, err);
        return "";
    }
}

/** Thumbnails for every src, a few at a time; the same src is loaded once. */
async function loadThumbnails(srcs: string[], onProgress?: (loaded: number, total: number) => void): Promise<Map<string, string>> {
    const unique = [...new Set(srcs.filter(Boolean))];
    const result = new Map<string, string>();
    let next = 0;
    let loaded = 0;
    onProgress?.(0, unique.length);
    const worker = async () => {
        while (next < unique.length) {
            const src = unique[next++];
            result.set(src, await thumbnailDataUrl(src));
            onProgress?.(++loaded, unique.length);
        }
    };
    await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, unique.length) }, worker));
    return result;
}

function buildHtml(options: PartsPdfOptions, thumbnails: Map<string, string>): string {
    const totalQty = options.rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
    const body = options.rows.map((row, i) => {
        const img = thumbnails.get(row.imageSrc);
        return `<tr>
  <td class="num">${i + 1}</td>
  <td class="img">${img ? `<img src="${img}" alt="">` : `<div class="noimg">No image</div>`}</td>
  <td class="name">${escapeHtml(row.name || "Unnamed part")}</td>
  <td class="cat">${row.catalogNumber?.trim() ? escapeHtml(row.catalogNumber.trim()) : `<span class="none">—</span>`}</td>
  <td class="size">${row.size?.trim() ? escapeHtml(row.size.trim()) : `<span class="none">—</span>`}</td>
  <td class="qty">${escapeHtml(String(row.quantity ?? ""))}</td>
  <td class="done"><span class="box"></span></td>
</tr>`;
    }).join("\n");

    const subtitles = (options.subtitleLines ?? []).filter(Boolean)
        .map((line) => `<div class="sub">${escapeHtml(line)}</div>`).join("");

    return `<!doctype html>
<html><head><meta charset="utf-8">
<title>${escapeHtml(options.title)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { font-size: 20pt; margin: 0 0 2mm; }
  .sub { font-size: 9.5pt; color: #555; margin-bottom: 1mm; }
  .summary { font-size: 10pt; font-weight: 600; margin: 3mm 0 4mm; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: .04em; color: #444; background: #f0f0f0; border-bottom: 1.5pt solid #333; padding: 2mm 3mm; }
  td { border-bottom: .5pt solid #ccc; padding: 2mm 3mm; vertical-align: middle; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  td.num { width: 9mm; color: #777; font-size: 9pt; text-align: right; }
  td.img { width: 34mm; }
  td.img img { display: block; width: 30mm; height: 30mm; object-fit: contain; border: .5pt solid #ddd; border-radius: 1.5mm; }
  .noimg { width: 30mm; height: 30mm; border: .5pt dashed #bbb; border-radius: 1.5mm; display: flex; align-items: center; justify-content: center; font-size: 8pt; color: #999; }
  td.name { font-size: 12pt; font-weight: 600; word-break: break-word; }
  th.cat, td.cat { width: 40mm; }
  td.cat { font-size: 10.5pt; font-family: Consolas, monospace; word-break: break-all; }
  td.cat .none { color: #aaa; }
  th.size, td.size { width: 30mm; }
  td.size { font-size: 9.5pt; color: #333; }
  td.size .none { color: #aaa; }
  th.qty, td.qty { width: 22mm; text-align: center; }
  td.qty { font-size: 18pt; font-weight: 700; }
  /* A box to tick by hand on the printed sheet. */
  th.done, td.done { width: 16mm; text-align: center; }
  td.done .box { display: inline-block; width: 7mm; height: 7mm; border: 1pt solid #333; border-radius: 1mm; }
</style></head>
<body>
  <h1>${escapeHtml(options.title)}</h1>
  ${subtitles}
  <div class="summary">${options.rows.length} part${options.rows.length === 1 ? "" : "s"} · total quantity ${totalQty}</div>
  <table>
    <thead><tr><th class="num">#</th><th>Image</th><th>Name</th><th class="cat">Catalogue #</th><th class="size">Size</th><th class="qty">Qty</th><th class="done">Done</th></tr></thead>
    <tbody>
${body}
    </tbody>
  </table>
</body></html>`;
}

/**
 * Opens the browser's print dialog with a parts list (image, name, quantity),
 * where it can be saved as a PDF ("Save as PDF" / "Microsoft Print to PDF").
 * Printed from a hidden frame, so the page itself is unchanged. Images that
 * can't be loaded show as "No image".
 */
export async function printPartsPdf(options: PartsPdfOptions): Promise<void> {
    const thumbnails = await loadThumbnails(options.rows.map((r) => r.imageSrc), options.onProgress);

    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    document.body.appendChild(frame);

    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!win || !doc) {
        frame.remove();
        throw new Error("The browser didn't allow the print frame");
    }
    doc.open();
    doc.write(buildHtml(options, thumbnails));
    doc.close();

    // All images are data: URLs; wait until they've loaded so none print blank.
    // (Not img.decode(): Chrome never resolves it in a hidden frame.)
    await Promise.race([
        Promise.all(Array.from(doc.images, (img) => img.complete ? undefined : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
        }))),
        new Promise((resolve) => setTimeout(resolve, IMAGE_LOAD_TIMEOUT_MS)),
    ]);

    // The browser suggests the page title as the PDF file name.
    const previousTitle = document.title;
    document.title = options.title;
    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        document.title = previousTitle;
        frame.remove();
    };
    win.addEventListener("afterprint", () => setTimeout(cleanup, 0));
    win.focus();
    win.print();
    // print() blocks until the dialog closes in most browsers; afterprint is
    // the backup. Removing the frame too early cancels the print in some, so
    // only remove it here after a long wait.
    setTimeout(cleanup, 60000);
}
