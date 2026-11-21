/**
 * Parts modeled several times in the same Part Studio (4 legs drawn one by
 * one instead of one leg inserted 4 times) are separate parts to Onshape, so
 * its BOM lists each one with quantity 1. This finds such copies among one
 * assembly's BOM items and combines them into one item with the total
 * quantity.
 *
 * Copies: parts of the same Part Studio, in the same configuration, with the
 * same shape (volume, surface area and principal moments of inertia, which
 * don't change when a copy is moved or rotated) and the same material. Their
 * names must match (or one still has Onshape's default "Part N" name), and so
 * must their part numbers when both have one: parts someone named or
 * numbered differently are kept apart on purpose. Colour doesn't count.
 *
 * Not caught: a mirrored copy has the same volume, area and moments as the
 * original, so a left/right pair with the same name and material is
 * combined. For this and any other wrong guess, a copy can be marked "not
 * the same part" in the panel (saved as keepSeparate): marked parts are only
 * combined with other marked parts, never with unmarked ones.
 */
import type { PartMassBody } from "../extension/onshapeDirect";
import type { ParsedOnshapeBomRow } from "./OnshapeBom";

/** A BOM item, possibly standing for several copies. */
export interface CombinedItem {
  item: ParsedOnshapeBomRow;
  /** The other copies' part IDs (empty when it stands for one part). */
  copyPartIDs: string[];
  /** Every copy as Onshape lists it, the shown one included (empty when it stands for one part). */
  copies: ParsedOnshapeBomRow[];
  /**
   * Same for every part of this Part Studio with this shape, marked "not the
   * same part" or not ("" when the part has no copies at all): lets the panel
   * move a copy between the marked and unmarked rows without reloading.
   */
  shapeGroup: string;
}

export interface PartStudioRef {
  documentID: string;
  wvmType: string;
  wvmID: string;
  elementID: string;
  configuration: string;
}

export const studioOf = (item: ParsedOnshapeBomRow): PartStudioRef => ({
  documentID: item.itemSource.documentId,
  wvmType: item.itemSource.wvmType,
  wvmID: item.itemSource.wvmId,
  elementID: item.itemSource.elementId,
  configuration: item.itemSource.configuration || "",
});

export const studioKey = (s: PartStudioRef) =>
  `${s.documentID}/${s.wvmType}/${s.wvmID}/${s.elementID}/${s.configuration}`;

/** Parts that could be copies: made parts (not Standard Content or vendor parts). */
const isCandidate = (item: ParsedOnshapeBomRow) =>
  !item.isSubassembly && !!item.itemSource.partId && !item.itemSource.isStandardContent && !item.vendor;

/** Part Studios with at least two candidate parts among `items`: only these need mass properties. */
export function studiosToCheck(items: ParsedOnshapeBomRow[]): PartStudioRef[] {
  const counts = new Map<string, { ref: PartStudioRef; n: number }>();
  for (const item of items) {
    if (!isCandidate(item)) continue;
    const ref = studioOf(item);
    const k = studioKey(ref);
    const entry = counts.get(k) ?? { ref, n: 0 };
    entry.n++;
    counts.set(k, entry);
  }
  return [...counts.values()].filter((e) => e.n >= 2).map((e) => e.ref);
}

const VOLUME_AREA_TOLERANCE = 1e-6;
const INERTIA_TOLERANCE = 1e-5;

const close = (a: number, b: number, rel: number) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b));

/** The same shape, wherever each copy sits and however it's turned. */
export function sameShape(a: PartMassBody, b: PartMassBody): boolean {
  const va = a.volume?.[0] ?? 0;
  const vb = b.volume?.[0] ?? 0;
  const sa = a.periphery?.[0] ?? 0;
  const sb = b.periphery?.[0] ?? 0;
  if (!(va > 0 && vb > 0 && sa > 0 && sb > 0)) return false; // unknown shape: never combined
  if (!close(va, vb, VOLUME_AREA_TOLERANCE) || !close(sa, sb, VOLUME_AREA_TOLERANCE)) return false;
  // Moments of inertia, when Onshape gives them for both (parts with a material).
  const ia = [...(a.principalInertia ?? [])].sort((x, y) => x - y);
  const ib = [...(b.principalInertia ?? [])].sort((x, y) => x - y);
  if (ia.length === 3 && ib.length === 3 && ia[2] > 0 && ib[2] > 0) {
    const scale = Math.max(ia[2], ib[2]);
    if (ia.some((m, i) => Math.abs(m - ib[i]) > INERTIA_TOLERANCE * scale)) return false;
  }
  return true;
}

const DEFAULT_NAME = /^Part \d+$/;
const norm = (s: string) => s.trim().toLowerCase();

function sameIdentity(a: ParsedOnshapeBomRow, b: ParsedOnshapeBomRow): boolean {
  if (norm(a.material) !== norm(b.material)) return false;
  const na = a.partNumber.trim();
  const nb = b.partNumber.trim();
  if (na && nb && na !== nb) return false;
  const ma = a.name.trim();
  const mb = b.name.trim();
  return ma === mb || DEFAULT_NAME.test(ma) || DEFAULT_NAME.test(mb);
}

/** Which copy the combined row shows: a named one, then a numbered one, then the lowest part ID (stable across loads). */
export function pickShown(group: ParsedOnshapeBomRow[]): ParsedOnshapeBomRow {
  const rank = (i: ParsedOnshapeBomRow) => (DEFAULT_NAME.test(i.name.trim()) ? 2 : 0) + (i.partNumber.trim() ? 0 : 1);
  return [...group].sort(
    (a, b) => rank(a) - rank(b) || (a.itemSource.partId! < b.itemSource.partId! ? -1 : 1)
  )[0];
}

/**
 * `items` with each set of copies combined into one item (the total
 * quantity), placed where the first copy was. `bodies` has the mass
 * properties of each checked Part Studio (by studioKey); parts without them
 * are left as they are.
 */
export function combineCopies(
  items: ParsedOnshapeBomRow[],
  bodies: ReadonlyMap<string, Record<string, PartMassBody>>,
  /** Part IDs marked "not the same part": combined only with each other. */
  keptSeparate: ReadonlySet<string> = new Set()
): CombinedItem[] {
  const isKept = (i: ParsedOnshapeBomRow) => keptSeparate.has(i.itemSource.partId!);
  /** Groups of copies; with `split`, marked and unmarked parts go in different groups. */
  const groupItems = (split: boolean) => {
    const groups: ParsedOnshapeBomRow[][] = [];
    const groupOf = new Map<ParsedOnshapeBomRow, ParsedOnshapeBomRow[]>();
    for (const item of items) {
      if (!isCandidate(item)) continue;
      const studio = studioKey(studioOf(item));
      const body = bodies.get(studio)?.[item.itemSource.partId!];
      if (!body) continue;
      const group = groups.find((g) => {
        const first = g[0];
        return (
          studioKey(studioOf(first)) === studio &&
          first.itemSource.partId !== item.itemSource.partId &&
          (!split || isKept(first) === isKept(item)) &&
          sameIdentity(first, item) &&
          sameShape(bodies.get(studio)![first.itemSource.partId!], body)
        );
      });
      if (group) group.push(item);
      else groups.push([item]);
      groupOf.set(item, group ?? groups[groups.length - 1]);
    }
    return groupOf;
  };
  const groupOf = groupItems(true);
  const shapeOf = groupItems(false);
  const shapeGroup = (item: ParsedOnshapeBomRow) => {
    const g = shapeOf.get(item);
    return g && g.length > 1 ? `${studioKey(studioOf(g[0]))}/${g[0].itemSource.partId}` : "";
  };

  const out: CombinedItem[] = [];
  for (const item of items) {
    const group = groupOf.get(item);
    if (!group || group.length < 2) {
      out.push({ item, copyPartIDs: [], copies: [], shapeGroup: shapeGroup(item) });
      continue;
    }
    if (group[0] !== item) continue; // listed with the first copy
    const shown = pickShown(group);
    out.push({
      item: { ...shown, quantity: group.reduce((sum, i) => sum + (i.quantity || 1), 0) },
      copyPartIDs: group.filter((i) => i !== shown).map((i) => i.itemSource.partId!),
      copies: group,
      shapeGroup: shapeGroup(item),
    });
  }
  return out;
}
