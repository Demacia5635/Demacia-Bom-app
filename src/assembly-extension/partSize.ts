/**
 * The panel's "Show size" column: which parts get a size, reading it from
 * Onshape, and when a saved one is out of date. Formatting is shared with the
 * website (util/partSize.ts).
 */
import type AssemblyBomRow from "./AssemblyBomRow";
import { getPartBoundingBox } from "../extension/onshapeDirect";
import { formatPartSize } from "../util/partSize";
import { keyOf } from "./onshapeKeys";
import { LOAD_CANCELLED } from "./requestPool";
import { isHiddenByStandardToggle } from "./rowRules";

/** Bounding-box requests in flight at once while "Show size" fills the Size column. */
export const SIZE_CONCURRENCY = 4;

/** Whether a row gets a size: made parts only (bought ones are named by their size already). */
export function needsSize(row: AssemblyBomRow): boolean {
  return !row.isAssembly && !isHiddenByStandardToggle(row) && !!row.entityID;
}

/**
 * Whether a size saved in the database is out of date: the part's model
 * changed since it was read. Sizes just read from Onshape (no sizeVersion) and
 * parts whose current version is unknown are kept.
 */
export function isSavedSizeStale(row: AssemblyBomRow, currentVersion: string | null): boolean {
  return row.sizeVersion !== undefined && !!currentVersion && row.sizeVersion !== currentVersion;
}

/**
 * A part's size text from Onshape (formatted by util/partSize), waiting and retrying when
 * rate-limited. Stops (throws LOAD_CANCELLED) once `isCancelled` says so.
 */
export async function readPartSize(row: AssemblyBomRow, isCancelled?: () => boolean): Promise<string> {
  const key = keyOf(row);
  for (let attempt = 0; ; attempt++) {
    if (isCancelled?.()) throw LOAD_CANCELLED;
    try {
      return formatPartSize(await getPartBoundingBox(key, row.entityID, row.configuration || undefined));
    } catch (err) {
      if ((err as { onshapeStatus?: number })?.onshapeStatus === 429 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}
