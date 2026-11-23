/**
 * A part's size as shown in the BOM tables: its bounding box in Onshape,
 * longest side first, in millimetres (e.g. "25 × 8 × 8 mm"). Parts named only
 * by their catalog number (spacers, shafts...) can then be told apart without
 * opening the model. Sorted, so the box's orientation in the Part Studio
 * doesn't matter; a part drawn at an angle gets a bigger box than its real size.
 */

/** Onshape's bounding box of a part, in metres. */
export interface BoundingBox {
  lowX: number;
  lowY: number;
  lowZ: number;
  highX: number;
  highY: number;
  highZ: number;
}

/** "25 × 8 × 8 mm" (one decimal where needed), or "" for a missing/empty box. */
export function formatPartSize(box: BoundingBox | null | undefined): string {
  if (!box) return "";
  // Lengths, whichever way round the corners are, so they sort as they print.
  const sides = [box.highX - box.lowX, box.highY - box.lowY, box.highZ - box.lowZ].map((m) => Math.abs(m * 1000));
  if (sides.some((mm) => !Number.isFinite(mm)) || sides.every((mm) => mm <= 0)) return "";
  const text = (mm: number) => String(Math.round(mm * 10) / 10);
  return `${sides.sort((a, b) => b - a).map(text).join(" × ")} mm`;
}

/** localStorage key of the "Show size" checkbox on the website's BOM and work-order pages. */
export const SHOW_SIZE_STORAGE_KEY = "showPartSize";

export function readShowSize(): boolean {
  try {
    return localStorage.getItem(SHOW_SIZE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeShowSize(on: boolean): void {
  try {
    localStorage.setItem(SHOW_SIZE_STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Not remembered; it still works until the page closes.
  }
}
