/**
 * OnshapeBom.tsx
 * =============================================================================
 * Types + a parser for Onshape's Bill of Materials table, which the panel
 * reads directly from Onshape with the user's session (getBom in
 * src/extension/onshapeDirect.ts: the unversioned
 * /api/assemblies/.../bom?indented=true endpoint; multiLevel=true for the
 * top assembly, false for sub-assemblies).
 *
 * CONFIRMED SHAPE (from a real multiLevel response; getBom returns its
 * `bomTable` key):
 *   {
 *     formatVersion, id, name, type: "multiLevel", createdAt, templateId,
 *     bomSource: { document, workspace, element, href, viewHref, configuration },
 *     headers: [ { name, propertyName, visible, propertyId }, ... ],
 *     items: [ ... ]
 *   }
 * - `headers` exists, but items do NOT use a headerIdToValue map - each
 *   item stores its column values as plain top-level properties, keyed by
 *   the header's `propertyName` (e.g. item.name, item.quantity,
 *   item.partNumber). `headers` is really just display metadata (label +
 *   visibility + ordering), not required to read a value.
 * - Sub-assemblies are NOT flagged with any boolean field. The reliable
 *   signal is `item.item`, the indented item number Onshape assigns:
 *     "1"    -> a top-level sub-assembly
 *     "1.1"  -> a part nested one level inside item "1"
 *     "1.2"  -> another part nested inside item "1"
 *     "2"    -> a top-level part (no children follow with "2.x")
 *   A row is a sub-assembly if some other row's `item` starts with
 *   "<thisItem>.", or if it has no partId (an empty sub-assembly). This
 *   requires looking at the whole items array together, not one row in
 *   isolation - see `parseOnshapeBomTable` below.
 * - `material` is an object ({ id, displayName, libraryName, ... }) rather
 *   than a plain string.
 */

export interface OnshapeBomItemSource {
  documentId: string;
  elementId: string;
  wvmId: string;
  wvmType: string;
  /** Present (non-empty) for a Part row; empty/absent for a sub-assembly row. */
  partId?: string;
  configuration?: string;
  fullConfiguration?: string;
  /** True for parts from Onshape's Standard Content library (bolts, nuts...). */
  isStandardContent?: boolean;
  indentLevel?: number;
  rowId?: string;
  viewHref?: string;
}

export interface OnshapeBomMaterial {
  id?: string;
  displayName?: string;
  libraryName?: string;
}

/** One raw item as this server's /onshape/bom proxy actually returns it.
 *  Loosely typed on purpose - the table has user-configured columns (some
 *  keyed by raw property ids, some by non-English display names) that this
 *  app doesn't need individually. */
export interface OnshapeBomItem {
  itemSource: OnshapeBomItemSource;
  /** Indented item number, e.g. "1", "1.1", "1.2", "2" - this is what tells
   *  us which rows are sub-assemblies and which rows are nested under them. */
  item: string;
  name?: string;
  description?: string;
  partNumber?: string;
  revision?: string;
  quantity?: number | string;
  comments?: string;
  material?: OnshapeBomMaterial | string;
  vendor?: string;
  [otherProperty: string]: unknown;
}

export interface OnshapeBomHeader {
  name: string;
  propertyName: string;
  visible: boolean;
  propertyId: string;
}

/** The response shape as the server actually returns it - no `bomTable` wrapper. */
export interface OnshapeBomTable {
  id: string;
  name: string;
  type?: string;
  description?: string;
  partNumber?: string;
  headers: OnshapeBomHeader[];
  items: OnshapeBomItem[];
  bomSource?: {
    element?: {
      vendor?: string
    }
  }
}

/**
 * Row fields that only some BOM templates have as a column. When the
 * document's BOM has the column, its value comes from Onshape; otherwise the
 * page falls back to the database.
 */
export type OptionalBomField =
  | "description"
  | "partNumber"
  | "revision"
  | "material"
  | "vendor"
  | "engineer"
  | "price"
  | "comments"
  | "mass";

/** Onshape property IDs of the custom/standard properties without a fixed propertyName. */
const OPTIONAL_FIELD_PROPERTY_IDS: Partial<Record<OptionalBomField, string>> = {
  engineer: "57f3fb8efa3416c06701d619",
  price: "6617a03ef812b159a51a8786",
  comments: "66154a7f56997c7041994212",
};

/** Which optional fields this BOM has a column for, and the item key each value is stored under. */
export function bomFieldColumns(table: OnshapeBomTable): Map<OptionalBomField, string> {
  const columns = new Map<OptionalBomField, string>();
  const headers = Array.isArray(table?.headers) ? table.headers : [];
  for (const field of ["description", "partNumber", "revision", "material", "vendor"] as const) {
    const h = headers.find((x) => x.propertyName === field);
    if (h) columns.set(field, h.propertyName);
  }
  for (const [field, id] of Object.entries(OPTIONAL_FIELD_PROPERTY_IDS) as [OptionalBomField, string][]) {
    const h = headers.find((x) => x.propertyId === id || x.propertyName === field);
    if (h) columns.set(field, h.propertyName);
  }
  const massHeader = headers.find((x) => /mass/i.test(x.propertyName || "") || /mass/i.test(x.name || ""));
  if (massHeader) columns.set("mass", massHeader.propertyName);
  return columns;
}

/** Plain value of a BOM cell: unwraps {value}/{displayName} objects and numeric text. */
function cellValue(raw: unknown, asNumber: boolean): string | number {
  let v: unknown = raw;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    v = o.value ?? o.displayName ?? o.name ?? "";
  }
  if (asNumber) {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
    return Number.isFinite(n) ? n : 0;
  }
  return v == null ? "" : String(v);
}

/** Normalized, easy-to-consume row pulled out of one raw Onshape BOM item. */
export interface ParsedOnshapeBomRow {
  /** Values of the optional fields this BOM has columns for (absent key = no column). */
  onshapeFields: Partial<Record<OptionalBomField, string | number>>;
  itemSource: OnshapeBomItemSource;
  /** The raw indented item number, e.g. "1", "1.1", "2". Kept around so
   *  nested children can be matched back to their parent row. */
  itemNumber: string;
  isSubassembly: boolean;
  name: string;
  description: string;
  partNumber: string;
  revision: string;
  quantity: number;
  material: string;
  vendor: string;
}

function materialToString(material: OnshapeBomItem["material"]): string {
  if (!material) return "";
  if (typeof material === "string") return material;
  return material.displayName || material.id || "";
}

function toParsedRow(
  item: OnshapeBomItem,
  isSubassembly: boolean,
  columns: Map<OptionalBomField, string>
): ParsedOnshapeBomRow {
  const quantityRaw = item.quantity;
  const quantity =
    typeof quantityRaw === "number" ? quantityRaw : quantityRaw ? Number(quantityRaw) || 1 : 1;

  const onshapeFields: ParsedOnshapeBomRow["onshapeFields"] = {};
  for (const [field, itemKey] of columns) {
    onshapeFields[field] =
      field === "material"
        ? materialToString(item[itemKey] as OnshapeBomItem["material"])
        : cellValue(item[itemKey], field === "price" || field === "mass");
  }

  return {
    onshapeFields,
    itemSource: item.itemSource,
    itemNumber: item.item || "",
    isSubassembly,
    name: item.name || "",
    description: item.description || "",
    partNumber: item.partNumber || "",
    revision: item.revision || "",
    quantity,
    material: materialToString(item.material),
    vendor: item.vendor || "",
  };
}

/**
 * Returns the DIRECT top-level rows of one BOM table - i.e. rows whose
 * `item` number has no dot (like "1" or "2"), not anything nested under a
 * sub-assembly (like "1.1"). A top-level row is a sub-assembly if some
 * OTHER row's item number is "<thisNumber>.something", or if its itemSource
 * has no partId (an empty sub-assembly has no children to number) - Onshape
 * doesn't mark this with a boolean field, so it has to be inferred.
 *
 * This deliberately ignores rows nested more than one level deep in the
 * SAME response (e.g. "1.1.2"): AssemblyBomPage re-fetches a fresh,
 * node-scoped BOM for every sub-assembly it recurses into, so each call to
 * this function only ever needs to describe the immediate children of
 * whichever assembly was queried - Onshape returns that assembly's own
 * contents at the top level ("1", "2", ...) with any further nesting
 * belonging to a sub-assembly's own separate fetch.
 */
export function parseOnshapeBomTable(table: OnshapeBomTable): ParsedOnshapeBomRow[] {
  const items = Array.isArray(table?.items) ? table.items : [];

  // Works on a single-level table too: every item is then top-level ("1",
  // "2"...), and sub-assemblies are told apart by their missing partId.
  const topLevel = items.filter((it) => !!it.item && !it.item.includes("."));
  const hasChildren = (itemNumber: string) =>
    !!itemNumber && items.some((it) => it.item && it.item.startsWith(`${itemNumber}.`));

  // A row without a partId is an assembly even when it has no children in the
  // response (an empty sub-assembly), which the numbering alone can't show.
  const isAssemblyRow = (item: OnshapeBomItem) =>
    hasChildren(item.item) || (!!item.itemSource && !item.itemSource.partId);

  const columns = bomFieldColumns(table);
  return topLevel.map((item) => toParsedRow(item, isAssemblyRow(item), columns));
}
