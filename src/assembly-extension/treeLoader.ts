/**
 * Loading the panel's tree: from the top assembly's Onshape BOM, every
 * sub-assembly and part as a row, with its database record when it has one
 * (Onshape first, the database for what Onshape doesn't have).
 */
import type { BomModel, PartModel } from "../util/Models";
import type AssemblyBomRow from "./AssemblyBomRow";
import { getOnshapeThumbnailSrc, type OnshapeKey } from "./BomApi";
import { parseOnshapeBomTable, type OnshapeBomTable, type OptionalBomField, type ParsedOnshapeBomRow } from "./OnshapeBom";
import { assemblyKeyId, bomIdOf, buildOnshapeElementURL, itemKey, keyOf, keyString, recordId } from "./onshapeKeys";
import { createCachedSources, createLimiter, directSources, recordOrNull, type TreeSources } from "./requestPool";
import {
  fileDefaultsForMaterial,
  fillCatalogNumberFromName,
  stampOf,
  STANDARD_PART_ENGINEER,
  withChangeTracking,
  revisionLabel,
  type FieldValues,
} from "./rowRules";

/** Requests in flight at once during Refresh BOM (Onshape + our server). */
export const REFRESH_CONCURRENCY = 6;

/**
 * The assembly's name from its Onshape BOM name ("BOM of <assembly>"), without
 * the prefix. "" when there is no name, so callers can fall back with `||`.
 */
export function assemblyNameOf(bom: Pick<OnshapeBomTable, "name"> | null | undefined): string {
  return (bom?.name ?? "").replace(/^\s*BOM of\b\s*/i, "").trim();
}

/** What a walk of the assembly tree (expandTree) works with. */
export interface ExpandContext {
  /** The Onshape host the panel's tab is on (for rows' Onshape links). */
  server: string | null;
  src: TreeSources;
  /** The top assembly's database record (null when it isn't saved). */
  rootBomDB: BomModel | null;
  /** Sub-assemblies already in the tree (listed once). */
  visited: Set<string>;
  /** Rows found, in Onshape's order. */
  out: AssemblyBomRow[];
  /** Called for each item as the walk reaches it (progress). */
  onItem?: (name: string) => void;
}

export interface ResolvedNode {
  row: AssemblyBomRow;
  key?: OnshapeKey;
  bomID?: string;
  onshapeBom?: OnshapeBomTable;
}

/**
 * Starts every request the tree walk will need, in parallel: each
 * sub-assembly's Onshape BOM and database record, and each part's record.
 * The insides of a sub-assembly the walk won't open (marked standard, or
 * from a vendor) are skipped. A failure is dropped from the cache, so the
 * walk asks again and reports it if it fails again.
 */
export async function prefetchTree(bom: OnshapeBomTable, src: TreeSources, seen = new Set<string>()): Promise<void> {
  await Promise.all(
    parseOnshapeBomTable(bom).map(async (item) => {
      const key = itemKey(item);
      if (!item.isSubassembly) {
        await src.dbPart(key, item.itemSource.partId || "").catch(() => {});
        return;
      }
      if (seen.has(keyString(key))) return;
      seen.add(keyString(key));
      const sub = await src.onshapeBom(key).catch(() => null);
      if (!sub) return;
      // Same test as the walk (resolveBomNode): a bought item's insides aren't loaded.
      const record = await src.dbBom(key, bomIdOf(sub, key)).catch(() => null);
      if (record?.markedStandard || record?.vendor || sub.bomSource?.element?.vendor) return;
      await prefetchTree(sub, src, seen);
    })
  );
}

export async function resolveBomNode(
  /** The Onshape host the panel's tab is on (for the row's Onshape link). */
  server: string | null,
  key: OnshapeKey,
  parentRowId: string | null,
  rootBom: BomModel | null | 'root',
  /** The parent BOM's line for this sub-assembly (its part number etc.); absent for the root. */
  parentItem?: ParsedOnshapeBomRow,
  /** Where Onshape/database data comes from (a per-load prefetching cache, or direct). */
  src: TreeSources = directSources
): Promise<{ node: ResolvedNode; dbBom: BomModel | null }> {
  const onshapeBom = await src.onshapeBom(key, rootBom === 'root');
  const bomID = bomIdOf(onshapeBom, key);

  const dbBom = await recordOrNull(src.dbBom(key, bomID));
  const rowId = recordId(key, bomID);

  const isPublished = Boolean(dbBom);
  const onshapeUrl = buildOnshapeElementURL(server, key);
  // Onshape where its BOM has the value, the database for the rest.
  const fromOnshape = parentItem?.onshapeFields ?? {};
  const pick = (field: OptionalBomField, dbValue: string | undefined, fallback = "") =>
    field in fromOnshape ? String(fromOnshape[field] ?? "") : dbValue || fallback;
  const vendor = dbBom?.vendor || onshapeBom.bomSource?.element?.vendor || "";
  // Marked as a standard (bought) part: one item, its insides aren't loaded.
  // One from a vendor always is.
  const markedStandard = (!!dbBom?.markedStandard || vendor !== "") && rootBom !== "root";

  const row: AssemblyBomRow = {
    id: rowId,
    parentId: parentRowId,
    isExpanded: true,
    source: isPublished ? "db" : "onshape-only",
    isAssembly: true,
    // Always Onshape's current thumbnail; the saved one is replaced on Publish BOM.
    avatar: getOnshapeThumbnailSrc(key),
    name: parentItem?.name || assemblyNameOf(onshapeBom) || dbBom?.name || key.elementID,
    catalogNumber: pick("partNumber", dbBom?.catalogNumber, onshapeBom.partNumber || ""),
    revision: "-",
    description: onshapeBom.description || pick("description", dbBom?.description),
    engineer: markedStandard ? STANDARD_PART_ENGINEER : pick("engineer", dbBom?.engineer),
    material: "-",
    mass: 0,
    price: 0,
    quantity: parentItem?.quantity || 1,
    comments: pick("comments", dbBom?.comments),
    saved: { avatarID: dbBom?.avatarID || undefined, filesModelVersion: dbBom?.filesModelVersion || undefined },
    dbUpdatedAt: stampOf(dbBom?.updatedAt),
    documentID: key.documentID,
    wvmType: key.wvmType,
    wvmID: key.wvmID,
    elementID: key.elementID,
    entityID: bomID,
    onshapeURL: dbBom?.onshapeURL || onshapeUrl,
    exportSTL: "",
    exportParasolid: "",
    vendor,
    markedStandard,
  };

  const tracked = withChangeTracking(
    row,
    dbBom
      ? ({
          name: dbBom.name ?? "",
          description: dbBom.description ?? "",
          catalogNumber: dbBom.catalogNumber ?? "",
          engineer: dbBom.engineer ?? "",
          comments: dbBom.comments ?? "",
          markedStandard,
        } as unknown as FieldValues)
      : null
  );
  // A sub-assembly named like a catalog number gets it as its number (the top
  // assembly has no row: the Publish form fills it the same way).
  const filled = rootBom === "root" ? tracked : fillCatalogNumberFromName(tracked);
  return { node: { row: filled, key, bomID, onshapeBom }, dbBom };
}

export async function resolvePartRow(
  /** The Onshape host the panel's tab is on (for the row's Onshape link). */
  server: string | null,
  parsedItem: ParsedOnshapeBomRow,
  parentRowId: string | null,
  /** Where Onshape/database data comes from (a per-load prefetching cache, or direct). */
  src: TreeSources = directSources
): Promise<AssemblyBomRow> {
  const key = itemKey(parsedItem);
  const partID = parsedItem.itemSource.partId || "";

  const dbPart: PartModel | null = await recordOrNull(src.dbPart(key, partID));
  const rowId = recordId(key, partID);

  const isPublished = Boolean(dbPart);
  const onshapeUrl = buildOnshapeElementURL(server, key);
  // Onshape where its BOM has the value, the database for the rest.
  const fromOnshape = parsedItem.onshapeFields;
  const pickText = (field: OptionalBomField, dbValue: string | undefined) =>
    field in fromOnshape ? String(fromOnshape[field] ?? "") : dbValue || "";
  const pickNumber = (field: OptionalBomField, dbValue: number | undefined) =>
    field in fromOnshape ? Number(fromOnshape[field]) || 0 : dbValue || 0;

  // Standard Content (screws, nuts...) and parts marked standard here: bought,
  // so no engineer, files or Onshape link. Vendor parts are always marked.
  const vendor = dbPart?.vendor || parsedItem.vendor || "";
  const markedStandard = !parsedItem.itemSource.isStandardContent && (!!dbPart?.markedStandard || vendor !== "");
  const standard = !!parsedItem.itemSource.isStandardContent || markedStandard;

  // Which files Publish BOM keeps: the saved choice; for parts saved before
  // choices existed, the files they already have; otherwise from the material.
  const material = pickText("material", dbPart?.material);
  const hasSavedChoice = !!dbPart && (typeof dbPart.wantStl === "boolean" || typeof dbPart.wantParasolid === "boolean");
  const files = standard
    ? { wantStl: false, wantParasolid: false }
    : hasSavedChoice
      ? { wantStl: !!dbPart!.wantStl, wantParasolid: !!dbPart!.wantParasolid }
      : dbPart
        ? { wantStl: !!dbPart.stlLink, wantParasolid: !!dbPart.parasolidLink }
        : fileDefaultsForMaterial(material);

  const savedValues: FieldValues | null = dbPart
    ? ({
        name: dbPart.name ?? "",
        description: dbPart.description ?? "",
        catalogNumber: dbPart.catalogNumber ?? "",
        engineer: dbPart.engineer ?? "",
        material: dbPart.material ?? "",
        price: dbPart.price ?? 0,
        comments: dbPart.comments ?? "",
        wantStl: files.wantStl,
        wantParasolid: files.wantParasolid,
        markedStandard,
      } as unknown as FieldValues)
    : null;

  return fillCatalogNumberFromName(withChangeTracking({
    id: rowId,
    parentId: parentRowId,
    isExpanded: false,
    source: isPublished ? "db" : "onshape-only",
    isAssembly: false,
    // Always Onshape's current image; the saved one is replaced on Publish BOM.
    avatar: getOnshapeThumbnailSrc(key, partID, parsedItem.itemSource),
    name: parsedItem.name || dbPart?.name || partID,
    catalogNumber: pickText("partNumber", dbPart?.catalogNumber),
    // Set by the server on each save that changes the part (not Onshape's Revision property).
    revision: revisionLabel(dbPart, standard),
    description: pickText("description", dbPart?.description),
    engineer: standard ? STANDARD_PART_ENGINEER : pickText("engineer", dbPart?.engineer),
    material,
    mass: pickNumber("mass", dbPart?.mass),
    // The saved size (checked against the current model after the load).
    ...(dbPart?.size ? { size: dbPart.size, sizeVersion: dbPart.filesModelVersion ?? "" } : {}),
    price: pickNumber("price", dbPart?.price),
    quantity: parsedItem.quantity || 1,
    comments: pickText("comments", dbPart?.comments),
    saved: {
      avatarID: dbPart?.avatarID || undefined,
      stlLink: dbPart?.stlLink || undefined,
      parasolidLink: dbPart?.parasolidLink || undefined,
      filesModelVersion: dbPart?.filesModelVersion || undefined,
    },
    dbUpdatedAt: stampOf(dbPart?.updatedAt),
    wantStl: files.wantStl,
    wantParasolid: files.wantParasolid,
    documentID: key.documentID,
    wvmType: key.wvmType,
    wvmID: key.wvmID,
    elementID: key.elementID,
    entityID: partID,
    onshapeURL: standard ? "" : dbPart?.onshapeURL || onshapeUrl,
    exportSTL: standard ? "" : dbPart?.stlLink || "",
    exportParasolid: standard ? "" : dbPart?.parasolidLink || "",
    vendor,
    configuration: parsedItem.itemSource.configuration || "",
    isStandardContent: !!parsedItem.itemSource.isStandardContent,
    markedStandard,
  }, savedValues));
}

/**
 * Adds the rows under `node` (its parts and sub-assemblies, all the way down)
 * to `ctx.out`, in Onshape's order. A sub-assembly used in several places
 * gets a row under each parent (so each parent's saved BOM lists it), but its
 * contents are listed once: rows share the sub-assembly's id, and the table
 * shows those contents under every row with that id. `ancestors` (the
 * sub-assemblies above `node`) stops an assembly that contains itself. One
 * marked as a standard part is one bought item, so its insides aren't loaded.
 */
export async function expandTree(node: ResolvedNode, isRoot: boolean, ctx: ExpandContext, ancestors: ReadonlySet<string>): Promise<void> {
  const parsedItems = node.onshapeBom ? parseOnshapeBomTable(node.onshapeBom) : [];
  const childParentId = isRoot ? null : node.row.id;

  for (const item of parsedItems) {
    ctx.onItem?.(item.name);
    if (item.isSubassembly) {
      const subKey = itemKey(item);
      const subKeyId = assemblyKeyId(subKey);
      if (ancestors.has(subKeyId)) continue; // contains itself

      // Another use of an already-loaded sub-assembly is served from the per-load cache.
      const { node: subNode } = await resolveBomNode(ctx.server, subKey, childParentId, ctx.rootBomDB, item, ctx.src);
      ctx.out.push(subNode.row);
      if (ctx.visited.has(subKeyId)) continue; // its contents are already listed
      ctx.visited.add(subKeyId);
      if (!subNode.row.markedStandard) await expandTree(subNode, false, ctx, new Set([...ancestors, subKeyId]));
    } else {
      ctx.out.push(await resolvePartRow(ctx.server, item, childParentId, ctx.src));
    }
  }
}

/**
 * Loads the insides of one sub-assembly row (after its standard-part mark is
 * removed: they weren't loaded while it was marked). Rows already in the tree
 * aren't added again.
 */
export async function loadSubtree(
  row: AssemblyBomRow,
  existing: AssemblyBomRow[],
  opts: {
    server: string | null;
    /** The panel's top assembly (part of the cycle guard). */
    rootKey: OnshapeKey | null;
    rootBomDB: BomModel | null;
    /** True once the panel closed: requests not started yet are refused. */
    isCancelled: () => boolean;
  }
): Promise<AssemblyBomRow[]> {
  // Closing the panel stops the requests not started yet (LOAD_CANCELLED).
  const limit = createLimiter(REFRESH_CONCURRENCY, opts.isCancelled);
  const src = createCachedSources(limit);
  const key = keyOf(row);
  const onshapeBom = await src.onshapeBom(key);
  // Sub-assemblies whose contents the tree already lists (not marked standard).
  const visited = new Set(
    existing.filter((r) => r.isAssembly && !r.markedStandard).map((r) => assemblyKeyId(r))
  );
  visited.add(assemblyKeyId(key));
  // This row and the assemblies above it (by parentId), for the cycle guard.
  const byId = new Map(existing.map((r) => [r.id, r]));
  const ancestors = new Set<string>();
  for (let r: AssemblyBomRow | undefined = row; r && !ancestors.has(assemblyKeyId(r)); r = r.parentId ? byId.get(r.parentId) : undefined) {
    ancestors.add(assemblyKeyId(r));
  }
  ancestors.add(assemblyKeyId(opts.rootKey ?? key));
  const out: AssemblyBomRow[] = [];
  await expandTree(
    { row, key, bomID: row.entityID, onshapeBom },
    false,
    { server: opts.server, src, rootBomDB: opts.rootBomDB, visited, out },
    ancestors
  );
  return out;
}
