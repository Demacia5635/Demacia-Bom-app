import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Table from "../components/Table";
import { fetchFromApi, type ApiError } from "../util/ApiService";
import type { BomModel, PartModel } from "../util/Models";
import { useOnshapeClient, useOnshapeContext } from "../extension/onshapeHostShim";
import "../css/AssemblyBomPage.css";
import {
  getBomByOnshapeKey,
  getOnshapeBom,
  getPartByOnshapeKey,
  updateOnshapePartMetadata,
  upsertBomById,
  upsertPartById,
  type OnshapeKey,
  updateOnshapeBomMetadata,
  syncPartFilesToDrive,
  syncBomThumbnailToDrive,
  getOnshapeThumbnailSrc,
  deleteDriveFile
} from "./BomApi";
import { getElementMicroversions } from "../extension/onshapeDirect";
import { beginImageVersionCheck, cancelImageVersionCheck, setImageVersions } from "../extension/imageCache";
import type AssemblyBomRow from "./AssemblyBomRow";
import { parseOnshapeBomTable, type OnshapeBomTable, type OptionalBomField, type ParsedOnshapeBomRow } from "./OnshapeBom";
import buildAssemblyBomColumns from "./AssemblyBomColumns";
import PublishBomModal, { type PublishBomFormValues, type PublishProgress } from "./PublishBomModel";
import { describeAge, readTreeCache, treeCacheKey, writeTreeCache } from "./treeCache";
import { setTelemetryAssembly, withOperation } from "../extension/telemetry";

function resolveWvm(context: Pick<ReturnType<typeof useOnshapeContext>, "workspaceId" | "versionId">): { wvmType: string; wvmID: string } | null {
  if (context.workspaceId) return { wvmType: "w", wvmID: context.workspaceId };
  if (context.versionId) return { wvmType: "v", wvmID: context.versionId };
  return null;
}

function buildOnshapeElementURL(server: string | null, key: OnshapeKey): string {
  const base = server || "https://cad.onshape.com";
  return `${base}/documents/${key.documentID}/${key.wvmType}/${key.wvmID}/e/${key.elementID}`;
}

/** What the saved copy of a tree keeps of the root Onshape BOM. */
function rootBomSummary(bom: OnshapeBomTable | null | undefined) {
  return bom ? { id: bom.id, name: bom.name, description: bom.description || "", partNumber: bom.partNumber || "" } : null;
}

/** Cells the user may edit (written to Onshape and the database on Publish BOM). */
const EDITABLE_FIELDS = ["name", "description", "catalogNumber", "revision", "engineer", "material", "price", "comments"];

type FieldValues = Record<string, string | number>;

/** The editable cells of a row. */
function editableValues(row: AssemblyBomRow): FieldValues {
  const r = row as unknown as Record<string, unknown>;
  return Object.fromEntries(EDITABLE_FIELDS.map((k) => [k, (r[k] ?? "") as string | number]));
}

/** Equal for display purposes: trimmed text; for price, 0 and empty are the same. */
function sameValue(field: string, a: unknown, b: unknown): boolean {
  if (field === "price") return (Number(a) || 0) === (Number(b) || 0);
  return String(a ?? "").trim() === String(b ?? "").trim();
}

/** Engineer written for Onshape Standard Content (screws, nuts, washers...). */
const STANDARD_PART_ENGINEER = "Standard Part";

/** Standard Content and vendor parts come from outside Onshape documents you own: not editable. */
function isLockedRow(row: AssemblyBomRow): boolean {
  return row.vendor !== "" || !!row.isStandardContent;
}

/** Editable cells of `row` that differ from `against` (none for Standard Content, which isn't editable). */
function changedFields(row: AssemblyBomRow, against: FieldValues | undefined): string[] {
  if (!against || isLockedRow(row)) return [];
  const r = row as unknown as Record<string, unknown>;
  return EDITABLE_FIELDS.filter((k) => !sameValue(k, r[k], against[k]));
}

/** Sets baseline/loaded/modified on a freshly loaded row. `saved` = its database values, if saved. */
function withChangeTracking(row: AssemblyBomRow, saved: FieldValues | null): AssemblyBomRow {
  const loaded = editableValues(row);
  // Fields the database doesn't keep for this item compare against what was loaded.
  const baseline = saved ? { ...loaded, ...saved } : loaded;
  const tracked = { ...row, loaded, baseline };
  return { ...tracked, modified: changedFields(tracked, baseline) };
}

/** A resolved assembly tree: the rows plus the root's database and Onshape records. */
interface LoadedTree {
  rows: AssemblyBomRow[];
  rootBomDB: BomModel | null;
  rootOnshapeBom: OnshapeBomTable | null;
}

/** Runs a network request, possibly waiting for a free slot first. */
type Limiter = <T>(request: () => Promise<T>) => Promise<T>;

/** Where the tree's Onshape and database data comes from. */
interface TreeSources {
  onshapeBom(key: OnshapeKey): Promise<OnshapeBomTable>;
  dbBom(key: OnshapeKey, bomID: string): Promise<BomModel>;
  dbPart(key: OnshapeKey, partID: string): Promise<PartModel>;
}

const directSources: TreeSources = {
  onshapeBom: getOnshapeBom,
  dbBom: getBomByOnshapeKey,
  dbPart: getPartByOnshapeKey,
};

const keyString = (k: OnshapeKey) => `${k.documentID}/${k.wvmType}/${k.wvmID}/${k.elementID}`;

/**
 * Per-load cache in front of the network: each BOM / record is requested once
 * (at most `limit` requests at a time), and asking again returns the same
 * promise. Lets a parallel prefetch run ahead of the in-order tree walk.
 */
function createCachedSources(limit: Limiter): TreeSources {
  const cache = new Map<string, Promise<unknown>>();
  const once = <T,>(cacheKey: string, request: () => Promise<T>): Promise<T> => {
    let p = cache.get(cacheKey) as Promise<T> | undefined;
    if (!p) {
      p = limit(request);
      cache.set(cacheKey, p);
      p.catch(() => {}); // failures are handled by whoever awaits it
    }
    return p;
  };
  return {
    onshapeBom: (key) => once(`bom:${keyString(key)}`, () => getOnshapeBom(key)),
    dbBom: (key, bomID) => once(`dbBom:${keyString(key)}/${bomID}`, () => getBomByOnshapeKey(key, bomID)),
    dbPart: (key, partID) => once(`dbPart:${keyString(key)}/${partID}`, () => getPartByOnshapeKey(key, partID)),
  };
}

const itemKey = (item: ParsedOnshapeBomRow): OnshapeKey => ({
  documentID: item.itemSource.documentId,
  wvmType: item.itemSource.wvmType,
  wvmID: item.itemSource.wvmId,
  elementID: item.itemSource.elementId,
});

/**
 * Starts every request the tree walk will need, in parallel: each
 * sub-assembly's Onshape BOM and database record, and each part's record.
 * Failures are left in the cache for the walk to report as before.
 */
async function prefetchTree(bom: OnshapeBomTable, src: TreeSources, seen = new Set<string>()): Promise<void> {
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
      await Promise.all([src.dbBom(key, sub.id || key.elementID).catch(() => {}), prefetchTree(sub, src, seen)]);
    })
  );
}

/**
 * At most `max` requests at once; the rest wait their turn. Applied to single
 * network calls (never to work that itself waits on other requests), so it
 * can't deadlock.
 */
function createLimiter(max: number): Limiter {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async (request) => {
    // Take a free slot, or wait until a finishing request hands its slot over.
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    else active += 1;
    try {
      return await request();
    } finally {
      const next = waiting.shift();
      if (next) next(); // the slot passes straight to the next request
      else active -= 1;
    }
  };
}

/** Requests in flight at once during Refresh BOM (Onshape + our server). */
const REFRESH_CONCURRENCY = 6;

/**
 * Items (parts / sub-assemblies) published at once. Each part exports its
 * thumbnail, STL and Parasolid together, so this is up to 3x as many Onshape
 * exports in flight. If Onshape rate-limits, those items are reported as
 * problems and retried by the next Publish BOM.
 */
const PUBLISH_CONCURRENCY = 5;

/** Short, stable fingerprint of a string (FNV-1a), for version keys. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * The current model version of every row image, for the image store
 * (imageCache.ts): one request per document workspace in the tree for its
 * tabs' change markers. Parts use their Part Studio's marker (versions never
 * change); assembly pictures show parts from across the tree, so they use a
 * fingerprint of every marker in it. Images with an unknown version aren't
 * stored.
 */
async function computeImageVersions(rows: AssemblyBomRow[], limit: Limiter): Promise<Map<string, string>> {
  const workspaces = new Map<string, Promise<Map<string, string> | null>>();
  for (const r of rows) {
    const key = `${r.documentID}/${r.wvmID}`;
    if (r.wvmType === "w" && !workspaces.has(key)) {
      workspaces.set(key, limit(() => getElementMicroversions(r.documentID, r.wvmID)).catch(() => null));
    }
  }
  const markers = new Map<string, Map<string, string> | null>();
  for (const [key, request] of workspaces) markers.set(key, await request);

  const modelVersion = (r: AssemblyBomRow): string | null =>
    r.wvmType !== "w"
      ? `${r.wvmType}:${r.wvmID}` // versions/microversions never change
      : markers.get(`${r.documentID}/${r.wvmID}`)?.get(r.elementID) ?? null;

  const all = rows.map(modelVersion);
  const treeVersion = all.every(Boolean) ? `tree:${fingerprint([...new Set(all)].sort().join(","))}` : null;

  const versions = new Map<string, string>();
  rows.forEach((r, i) => {
    const version = r.isAssembly ? treeVersion : all[i];
    if (r.avatar && version) versions.set(r.avatar, version);
  });
  return versions;
}

/** Loads a parent assembly's DB record (null when missing); memoized per tree load. */
type ParentBomLoader = (bomRowId: string) => Promise<BomModel | null>;

interface ResolvedNode {
  row: AssemblyBomRow;
  key?: OnshapeKey;
  bomID?: string;
  onshapeBom?: OnshapeBomTable;
}

export default function AssemblyBomPage() {
  const context = useOnshapeContext();
  const client = useOnshapeClient({ context });

  const [rows, setRows] = useState<AssemblyBomRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [rootBomDB, setRootBomDB] = useState<BomModel | null>(null);
  const [rootIsPublished, setRootIsPublished] = useState<boolean>(false);
  const [rootOnshapeBom, setRootOnshapeBom] = useState<OnshapeBomTable | null>(null);

  /** Tree-loading progress; null until the root BOM has been read. */
  const [loadProgress, setLoadProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  /** When the rows on screen come from the saved copy: when it was saved. */
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  /** When the tree on screen was loaded from Onshape (kept when edits update the saved copy). */
  const treeSavedAtRef = useRef<number>(Date.now());
  /** The tree on screen, for handlePublish when it isn't handed a freshly loaded one. */
  const currentTreeRef = useRef<LoadedTree>({ rows: [], rootBomDB: null, rootOnshapeBom: null });
  currentTreeRef.current = { rows, rootBomDB, rootOnshapeBom };

  const [publishOpen, setPublishOpen] = useState(false);
  /** Progress of a running Publish / Update BOM; null when idle. */
  const [publishProgress, setPublishProgress] = useState<PublishProgress | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Memoized on the ID strings: a new object every render made loadTree (and
  // its effect) change every render, reloading the tree endlessly.
  const { documentId, workspaceId, versionId, elementId } = context;
  const rootKey: OnshapeKey | null = useMemo(() => {
    const wvm = resolveWvm({ workspaceId, versionId });
    return documentId && wvm && elementId
      ? { documentID: documentId, wvmType: wvm.wvmType, wvmID: wvm.wvmID, elementID: elementId }
      : null;
  }, [documentId, workspaceId, versionId, elementId]);

  const resolveBomNode = useCallback(
    async (
      key: OnshapeKey,
      parentRowId: string | null,
      rootBom: BomModel | null | 'root',
      getParentBom: ParentBomLoader,
      /** The parent BOM's line for this sub-assembly (its part number etc.); absent for the root. */
      parentItem?: ParsedOnshapeBomRow,
      /** Where Onshape/database data comes from (a per-load prefetching cache, or direct). */
      src: TreeSources = directSources
    ): Promise<{ node: ResolvedNode; dbBom: BomModel | null }> => {
      const onshapeBom = await src.onshapeBom(key);
      const bomID = onshapeBom.id || key.elementID;

      let dbBom: BomModel | null = null;
      try {
        dbBom = await src.dbBom(key, bomID);
      } catch {
        dbBom = null;
      }
      const rowId = `${key.documentID}_${key.wvmType}_${key.wvmID}_${key.elementID}_${bomID}`;

      const isPublished = Boolean(dbBom);
      const isExist = isPublished && rootBom !== 'root' && rootBom !== null && (
        parentRowId
          ? Boolean((await getParentBom(parentRowId))?.subAssemblies?.find((c) => c.bomID === rowId)) :
          Boolean(rootBom.subAssemblies.find((c) => c.bomID === rowId))
      );
      const onshapeUrl = buildOnshapeElementURL(context.server, key);
      // Onshape where its BOM has the value, the database for the rest.
      const fromOnshape = parentItem?.onshapeFields ?? {};
      const pick = (field: OptionalBomField, dbValue: string | undefined, fallback = "") =>
        field in fromOnshape ? String(fromOnshape[field] ?? "") : dbValue || fallback;

      const row: AssemblyBomRow = {
        id: rowId,
        parentId: parentRowId,
        isExpanded: true,
        source: isPublished ? "db" : "onshape-only",
        isAssembly: true,
        // Always Onshape's current thumbnail; the saved one is replaced on Publish BOM.
        avatar: getOnshapeThumbnailSrc(key),
        name: parentItem?.name || onshapeBom.name.slice(6) || dbBom?.name || key.elementID,
        catalogNumber: pick("partNumber", dbBom?.catalogNumber, onshapeBom.partNumber || ""),
        revision: "-",
        description: onshapeBom.description || pick("description", dbBom?.description),
        engineer: pick("engineer", dbBom?.engineer),
        material: "-",
        mass: 0,
        price: 0,
        quantity: parentItem?.quantity || 1,
        comments: pick("comments", dbBom?.comments),
        saved: { avatarID: dbBom?.avatarID || undefined },
        documentID: key.documentID,
        wvmType: key.wvmType,
        wvmID: key.wvmID,
        elementID: key.elementID,
        entityID: bomID,
        onshapeURL: dbBom?.onshapeURL || onshapeUrl,
        exportSTL: "",
        exportParasolid: "",
        dbAction: isExist ? "" : "add",
        vendor: dbBom?.vendor || onshapeBom.bomSource?.element?.vendor || "",
      };

      const tracked = withChangeTracking(
        row,
        dbBom
          ? {
              name: dbBom.name ?? "",
              description: dbBom.description ?? "",
              catalogNumber: dbBom.catalogNumber ?? "",
              engineer: dbBom.engineer ?? "",
              comments: dbBom.comments ?? "",
            }
          : null
      );
      return { node: { row: tracked, key, bomID, onshapeBom }, dbBom };
    },
    [context.server]
  );

  const resolvePartRow = useCallback(
    async (
      parsedItem: ParsedOnshapeBomRow,
      parentRowId: string | null,
      rootBom: BomModel | null,
      getParentBom: ParentBomLoader,
      /** Where Onshape/database data comes from (a per-load prefetching cache, or direct). */
      src: TreeSources = directSources
    ): Promise<AssemblyBomRow> => {
      const key: OnshapeKey = {
        documentID: parsedItem.itemSource.documentId,
        wvmType: parsedItem.itemSource.wvmType,
        wvmID: parsedItem.itemSource.wvmId,
        elementID: parsedItem.itemSource.elementId,
      };
      const partID = parsedItem.itemSource.partId || "";

      let dbPart: PartModel | null = null;
      try {
        dbPart = await src.dbPart(key, partID);
      } catch {
        dbPart = null;
      }
      const rowId = `${key.documentID}_${key.wvmType}_${key.wvmID}_${key.elementID}_${partID}`;

      const isPublished = Boolean(dbPart);
      const isExist = isPublished && rootBom !== null && (
        parentRowId
          ? Boolean((await getParentBom(parentRowId))?.parts?.find((c) => c.partID === rowId)) :
          Boolean(rootBom.parts.find((c) => c.partID === rowId))
      );
      const onshapeUrl = buildOnshapeElementURL(context.server, key);
      // Onshape where its BOM has the value, the database for the rest.
      const fromOnshape = parsedItem.onshapeFields;
      const pickText = (field: OptionalBomField, dbValue: string | undefined) =>
        field in fromOnshape ? String(fromOnshape[field] ?? "") : dbValue || "";
      const pickNumber = (field: OptionalBomField, dbValue: number | undefined) =>
        field in fromOnshape ? Number(fromOnshape[field]) || 0 : dbValue || 0;

      // Standard Content (screws, nuts...): bought, so no engineer, files or Onshape link.
      const standard = !!parsedItem.itemSource.isStandardContent;

      const savedValues: FieldValues | null = dbPart
        ? {
            name: dbPart.name ?? "",
            description: dbPart.description ?? "",
            catalogNumber: dbPart.catalogNumber ?? "",
            revision: dbPart.revision ?? "",
            engineer: dbPart.engineer ?? "",
            material: dbPart.material ?? "",
            price: dbPart.price ?? 0,
            comments: dbPart.comments ?? "",
          }
        : null;

      return withChangeTracking({
        id: rowId,
        parentId: parentRowId,
        isExpanded: false,
        source: isPublished ? "db" : "onshape-only",
        isAssembly: false,
        // Always Onshape's current image; the saved one is replaced on Publish BOM.
        avatar: getOnshapeThumbnailSrc(key, partID, parsedItem.itemSource),
        name: parsedItem.name || dbPart?.name || partID,
        catalogNumber: pickText("partNumber", dbPart?.catalogNumber),
        revision: pickText("revision", dbPart?.revision),
        description: pickText("description", dbPart?.description),
        engineer: standard ? STANDARD_PART_ENGINEER : pickText("engineer", dbPart?.engineer),
        material: pickText("material", dbPart?.material),
        mass: pickNumber("mass", dbPart?.mass),
        price: pickNumber("price", dbPart?.price),
        quantity: parsedItem.quantity || 1,
        comments: pickText("comments", dbPart?.comments),
        saved: {
          avatarID: dbPart?.avatarID || undefined,
          stlLink: dbPart?.stlLink || undefined,
          parasolidLink: dbPart?.parasolidLink || undefined,
        },
        documentID: key.documentID,
        wvmType: key.wvmType,
        wvmID: key.wvmID,
        elementID: key.elementID,
        entityID: partID,
        onshapeURL: standard ? "" : dbPart?.onshapeURL || onshapeUrl,
        exportSTL: standard ? "" : dbPart?.stlLink || "",
        exportParasolid: standard ? "" : dbPart?.parasolidLink || "",
        dbAction: isExist ? "" : "add",
        vendor: dbPart?.vendor || parsedItem.vendor || "",
        configuration: parsedItem.itemSource.configuration || "",
        isStandardContent: !!parsedItem.itemSource.isStandardContent,
      }, savedValues);
    },
    [context.server]
  );

  /**
   * Loads the assembly tree from Onshape + the database and returns it (null
   * on failure). With `preferCache`, a saved copy is shown instead when there
   * is one, without contacting Onshape: opening an assembly doesn't reload it;
   * the Refresh button does.
   */
  const loadTree = useCallback(async (options: { preferCache?: boolean } = {}): Promise<LoadedTree | null> => {
    if (!rootKey) return null;

    setLoading(true);
    setError(null);
    setLoadProgress(null);
    // Row images wait for the model-change check before rendering (imageCache.ts).
    beginImageVersionCheck();

    const cacheKey = treeCacheKey(rootKey);
    if (options.preferCache) {
      const cached = readTreeCache(cacheKey);
      if (cached) {
        setRows(cached.rows);
        setRootBomDB(cached.rootBomDB);
        setRootIsPublished(Boolean(cached.rootBomDB));
        setRootOnshapeBom(
          cached.rootBom ? ({ ...cached.rootBom, headers: [], items: [] } as OnshapeBomTable) : null
        );
        setCachedAt(cached.savedAt);
        setTelemetryAssembly(cached.rootBom?.name?.slice(6) || cached.rootBomDB?.name || "", rootKey.documentID, rootKey.elementID);
        treeSavedAtRef.current = cached.savedAt;
        setLoading(false);
        // Images of unchanged models come from the image store; only changed ones render.
        void withOperation("Check for model changes", () =>
          computeImageVersions(cached.rows, createLimiter(REFRESH_CONCURRENCY))
        ).then(setImageVersions, cancelImageVersionCheck);
        return null;
      }
    }

    // A load from Onshape is one "Refresh BOM" operation on the footprint page (/tele).
    return withOperation("Refresh BOM", async () => {
    // Requests run in parallel (at most REFRESH_CONCURRENCY at once) through a
    // per-load cache: a prefetch downloads everything ahead while the walk
    // below builds the rows in the same order as before.
    const limit = createLimiter(REFRESH_CONCURRENCY);
    const src = createCachedSources(limit);

    // Each parent assembly's DB record is fetched once per load, not once per child row.
    const parentBomRequests = new Map<string, Promise<BomModel | null>>();
    const getParentBom: ParentBomLoader = (bomRowId) => {
      let request = parentBomRequests.get(bomRowId);
      if (!request) {
        request = limit(() => fetchFromApi<BomModel>(`/db/bom/id/${encodeURIComponent(bomRowId)}`)).catch(
          () => null
        );
        parentBomRequests.set(bomRowId, request);
      }
      return request;
    };

    const visitedBomIds = new Set<string>();
    const allRows: AssemblyBomRow[] = [];

    try {
      const { node: rootNode, dbBom } = await resolveBomNode(rootKey, null, 'root', getParentBom, undefined, src);
      if (rootNode.onshapeBom) void prefetchTree(rootNode.onshapeBom, src);
      setRootBomDB(dbBom);
      setRootIsPublished(Boolean(dbBom));
      setRootOnshapeBom(rootNode.onshapeBom ?? null);
      setTelemetryAssembly(rootNode.onshapeBom?.name?.slice(6) || dbBom?.name || "", rootKey.documentID, rootKey.elementID);
      visitedBomIds.add(rootNode.bomID!);

      // The root BOM is multi-level, so its item count covers the whole tree
      // (an estimate: repeated sub-assemblies are resolved only once).
      const total = rootNode.onshapeBom?.items?.length ?? 0;
      setLoadProgress({ done: 0, total, current: "" });

      async function expand(node: ResolvedNode, isRoot: boolean) {
        const parsedItems = node.onshapeBom ? parseOnshapeBomTable(node.onshapeBom) : [];
        const childParentId = isRoot ? null : node.row.id;

        for (const item of parsedItems) {
          setLoadProgress({ done: allRows.length, total, current: item.name });
          if (item.isSubassembly) {
            const subKey: OnshapeKey = {
              documentID: item.itemSource.documentId,
              wvmType: item.itemSource.wvmType,
              wvmID: item.itemSource.wvmId,
              elementID: item.itemSource.elementId,
            };
            const subKeyId = `${subKey.documentID}_${subKey.wvmType}_${subKey.wvmID}_${subKey.elementID}`;
            if (visitedBomIds.has(subKeyId)) continue;
            visitedBomIds.add(subKeyId);

            const { node: subNode } = await resolveBomNode(subKey, childParentId, dbBom, getParentBom, item, src);
            allRows.push(subNode.row);
            await expand(subNode, false);
          } else {
            const partRow = await resolvePartRow(item, childParentId, dbBom, getParentBom, src);
            allRows.push(partRow);
          }
        }
      }

      await expand(rootNode, true);
      // A refresh discards unpublished edits (handleRefresh asks first).
      const freshRows = allRows;
      // Which row images changed since they were stored (one request per document).
      setImageVersions(await computeImageVersions(freshRows, limit).catch(() => new Map<string, string>()));
      setRows(freshRows);
      setCachedAt(null);
      treeSavedAtRef.current = Date.now();
      writeTreeCache(cacheKey, {
        rows: freshRows,
        rootBomDB: dbBom,
        rootBom: rootBomSummary(rootNode.onshapeBom),
      });
      return { rows: freshRows, rootBomDB: dbBom, rootOnshapeBom: rootNode.onshapeBom ?? null };
    } catch (err: any) {
      setError(err as ApiError);
      cancelImageVersionCheck(); // don't keep images waiting for a check that won't come
      return null;
    } finally {
      setLoading(false);
    }
    });
  }, [rootKey, resolveBomNode, resolvePartRow]);

  // Opening an assembly: show its saved copy if there is one; otherwise load it.
  useEffect(() => {
    if (rootKey) {
      loadTree({ preferCache: true });
    }
  }, [rootKey, loadTree]);

  // The extension's column set never changes (edits are local until Publish BOM).
  const columns = useMemo(() => buildAssemblyBomColumns(), []);

  /**
   * Table edits stay in this browser until Publish BOM: cells that differ
   * from the database (or, for items not saved yet, from what was loaded) are
   * marked, and kept in the saved copy of the tree so they survive closing the
   * panel. A Refresh BOM discards them. Nothing is written to Onshape or the
   * database here.
   */
  const handleTableEdit = useCallback(
    (newData: AssemblyBomRow[]) => {
      const previousById = new Map(rows.map((r) => [r.id, r]));
      let blocked = false;

      const nextRows = newData.map((row) => {
        const prev = previousById.get(row.id);
        if (!prev) return row;
        const editedKeys = EDITABLE_FIELDS.filter(
          (k) => (row as unknown as Record<string, unknown>)[k] !== (prev as unknown as Record<string, unknown>)[k]
        );
        if (editedKeys.length === 0) return row; // e.g. expanding/collapsing a row
        if (isLockedRow(prev) || loading || publishing) {
          blocked = true; // Standard Content isn't editable; mid-refresh edits would be lost
          return { ...row, ...Object.fromEntries(editedKeys.map((k) => [k, (prev as unknown as Record<string, unknown>)[k]])) } as AssemblyBomRow;
        }
        // Marked only while it differs from the saved (or loaded) value: typing
        // something and then removing it leaves the cell unmarked.
        return { ...row, modified: changedFields(row, row.baseline ?? row.loaded) };
      });

      if (blocked && (loading || publishing)) {
        client.showMessageBubble("Wait until the refresh or publish has finished, then edit again.");
      }

      setRows(nextRows);
      // Keep the saved copy in step, so edits survive closing the panel.
      if (rootKey) {
        writeTreeCache(
          treeCacheKey(rootKey),
          { rows: nextRows, rootBomDB, rootBom: rootBomSummary(rootOnshapeBom) },
          treeSavedAtRef.current
        );
      }
    },
    [rows, client, loading, publishing, rootKey, rootBomDB, rootOnshapeBom]
  );

  /**
   * Publish BOM: writes the tree on screen to the database, replacing what is
   * saved there. Every assembly and part is written in full with a fresh
   * thumbnail, STL and Parasolid; the Drive files they replace are deleted.
   * Cells edited in the table are written to Onshape first, so Onshape stays
   * the source. It does not reload from Onshape: the table is updated in place.
   */
  const handlePublish = useCallback(
    async (values: PublishBomFormValues) => withOperation("Publish BOM", async () => {
      const { rows, rootBomDB, rootOnshapeBom } = currentTreeRef.current;
      if (!rootKey || !rootOnshapeBom) return;
      setPublishing(true);
      setPublishError(null);

      const rootID = rootBomDB?.id || `${rootKey.documentID}_${rootKey.wvmType}_${rootKey.wvmID}_${rootKey.elementID}_${rootOnshapeBom?.id}` || "wrong id";

      const ROOT_SENTINEL = "__root__";
      const rootRowId = ROOT_SENTINEL;

      const childrenByParentRowId = new Map<string, AssemblyBomRow[]>();
      for (const row of rows) {
        const parentKey = row.parentId ?? ROOT_SENTINEL;
        const list = childrenByParentRowId.get(parentKey) ?? [];
        list.push(row);
        childrenByParentRowId.set(parentKey, list);
      }

      const buildLinkArrays = (parentRowId: string) => {
        const children = childrenByParentRowId.get(parentRowId) ?? [];
        const parts = children
          .filter((c) => !c.isAssembly)
          .map((c) => ({ partID: c.id, quantity: c.quantity || 1 }));
        const subAssemblies = children
          .filter((c) => c.isAssembly)
          .map((c) => ({ bomID: c.id, quantity: c.quantity || 1 }));
        return { parts, subAssemblies };
      };

      // The top assembly, each sub-assembly and each distinct part is one item.
      // A part used in several places is published once.
      const seenParts = new Set<string>();
      const rowsToPublish = rows.filter((r) => r.isAssembly || (!seenParts.has(r.id) && !!seenParts.add(r.id)));
      const total = 1 + rowsToPublish.length;

      // Progress: items done, and what each item being worked on is doing.
      let done = 0;
      let nextTrackId = 0;
      const active = new Map<number, { name: string; step: string }>();
      // Problems don't stop the publish; they're reported at the end.
      const problems: string[] = [];
      const report = () =>
        setPublishProgress({ done, total, active: Array.from(active.values()), failed: problems.length });
      const track = (name: string, step: string) => {
        const id = nextTrackId++;
        active.set(id, { name, step });
        report();
        return {
          step: (next: string) => {
            active.set(id, { name, step: next });
            report();
          },
          finish: () => {
            active.delete(id);
            done += 1;
            report();
          },
        };
      };

      /** New Drive file if one was made, else the saved one; remembers the replaced file. */
      const replaceFile = (oldId: string | undefined, newId: string | null, toDelete: string[]) => {
        if (newId && oldId && oldId !== newId) toDelete.push(oldId);
        return newId || oldId || "";
      };
      /** Deletes replaced files once the record pointing at the new ones is saved. */
      const deleteReplaced = async (ids: string[]) => {
        for (const id of ids) {
          if (!(await deleteDriveFile(id))) console.warn(`[publish] could not delete replaced Drive file ${id}`);
        }
      };

      const onshapeUrlOf = (k: OnshapeKey) =>
        `https://cad.onshape.com/documents/${k.documentID}/${k.wvmType}/${k.wvmID}/e/${k.elementID}`;

      try {
        const isUpdate = Boolean(rootBomDB);
        const rootTrack = track(values.name, isUpdate ? "Replacing the saved assembly" : "Saving the assembly");
        const rootLinks = buildLinkArrays(rootRowId);
        const rootToDelete: string[] = [];
        const rootAvatar = await syncBomThumbnailToDrive(rootKey, values.name);
        if (!rootAvatar) problems.push(`Thumbnail of "${values.name}"`);
        const savedRoot = await upsertBomById(rootID, {
          id: rootID,
          name: values.name,
          description: values.description,
          comments: values.comments,
          catalogNumber: values.catalogNumber,
          engineer: rootBomDB?.engineer || values.defaultEngineer,
          parts: rootLinks.parts,
          subAssemblies: rootLinks.subAssemblies,
          avatarID: replaceFile(rootBomDB?.avatarID, rootAvatar, rootToDelete),
          onshapeID: {
            ...rootKey,
            bomID: rootOnshapeBom.id
          },
          onshapeURL: onshapeUrlOf(rootKey),
        });
        await deleteReplaced(rootToDelete);
        rootTrack.finish();

        // What changed per row, applied to the table at the end.
        const rowUpdates = new Map<string, Partial<AssemblyBomRow>>();
        // Rows whose edits could not be written to Onshape stay marked.
        const unsavedEdits = new Set<string>();

        /** Publishes one sub-assembly or part (edits to Onshape, files, record). */
        const publishRow = async (row: AssemblyBomRow, progress: ReturnType<typeof track>) => {
          const key: OnshapeKey = {
            documentID: row.documentID,
            wvmType: row.wvmType,
            wvmID: row.wvmID,
            elementID: row.elementID,
          };

          // 1. Cells changed from what was loaded from Onshape go to Onshape first.
          const edited = changedFields(row, row.loaded);
          if (edited.length > 0 && row.vendor === "") {
            progress.step("Writing edits to Onshape");
            const values_ = row as unknown as Record<string, unknown>;
            try {
              if (row.isAssembly) {
                const data: Record<string, unknown> = {};
                if (edited.includes("name")) data.name = row.name;
                if (edited.includes("description")) data.description = row.description;
                if (edited.includes("catalogNumber")) data["part number"] = row.catalogNumber;
                if (Object.keys(data).length > 0) await updateOnshapeBomMetadata(key, data);
              } else {
                // Material is a library reference in Onshape; it's saved to the database only.
                const data = Object.fromEntries(edited.filter((k) => k !== "material").map((k) => [k, values_[k]]));
                if (Object.keys(data).length > 0) await updateOnshapePartMetadata(key, row.entityID, data);
              }
            } catch (err: any) {
              unsavedEdits.add(row.id);
              problems.push(`Onshape properties of "${row.name}": ${err?.message || err}`);
            }
          }

          // 2. The full record, with fresh files.
          const engineer = row.isStandardContent
            ? STANDARD_PART_ENGINEER
            : row.vendor !== ""
              ? row.vendor
              : row.engineer || values.defaultEngineer;
          const toDelete: string[] = [];
          if (row.isAssembly) {
            const links = buildLinkArrays(row.id);
            progress.step("Saving thumbnail");
            const avatar = await syncBomThumbnailToDrive(key, row.name);
            if (!avatar) problems.push(`Thumbnail of "${row.name}"`);
            const avatarID = replaceFile(row.saved?.avatarID, avatar, toDelete);
            await upsertBomById(row.id, {
              id: row.id,
              name: row.name,
              description: row.description,
              catalogNumber: row.catalogNumber,
              comments: row.comments,
              engineer,
              parts: links.parts,
              subAssemblies: links.subAssemblies,
              onshapeURL: onshapeUrlOf(key),
              avatarID,
              onshapeID: {
                ...key,
                bomID: row.entityID,
              },
              vendor: row.vendor
            });
            rowUpdates.set(row.id, { saved: { avatarID } });
          } else {
            // Standard Content (screws, nuts...) is bought, not made: thumbnail only,
            // no STL / Parasolid / Onshape link (any saved earlier are removed).
            const standard = !!row.isStandardContent;
            progress.step(standard ? "Saving thumbnail" : "Exporting thumbnail, STL and Parasolid");
            const files = await syncPartFilesToDrive(key, row.entityID, row.name, {
              configuration: row.configuration,
              ...(standard ? { only: ["thumbnail" as const] } : {}),
            });
            problems.push(...files.failures);
            if (standard) {
              if (row.saved?.stlLink) toDelete.push(row.saved.stlLink);
              if (row.saved?.parasolidLink) toDelete.push(row.saved.parasolidLink);
            }
            const saved = {
              avatarID: replaceFile(row.saved?.avatarID, files.avatarID, toDelete),
              stlLink: standard ? "" : replaceFile(row.saved?.stlLink, files.stlLink, toDelete),
              parasolidLink: standard ? "" : replaceFile(row.saved?.parasolidLink, files.parasolidLink, toDelete),
            };
            progress.step("Saving to the database");
            await upsertPartById(row.id, {
              id: row.id,
              name: row.name,
              description: row.description,
              catalogNumber: row.catalogNumber,
              revision: row.revision,
              material: row.material,
              mass: row.mass,
              price: row.price,
              comments: row.comments,
              engineer,
              avatarID: saved.avatarID,
              stlLink: saved.stlLink,
              parasolidLink: saved.parasolidLink,
              onshapeURL: standard ? "" : onshapeUrlOf(key),
              onshapeID: {
                ...key,
                partID: row.entityID,
              },
              vendor: row.vendor,
              // Work orders treat these as purchased (no catalog number needed).
              isStandardContent: !!row.isStandardContent,
            });
            rowUpdates.set(row.id, {
              saved,
              exportSTL: saved.stlLink,
              exportParasolid: saved.parasolidLink,
              ...(standard ? { onshapeURL: "", engineer } : {}),
            });
          }

          // 3. The record now points at the new files; remove the ones it replaced.
          if (toDelete.length > 0) progress.step("Removing replaced files");
          await deleteReplaced(toDelete);
        };

        // Up to PUBLISH_CONCURRENCY items at once. One item failing doesn't stop
        // the others: it's listed as a problem and keeps its unpublished state.
        const queue = [...rowsToPublish];
        const published = new Set<string>();
        await Promise.all(
          Array.from({ length: Math.min(PUBLISH_CONCURRENCY, queue.length) }, async () => {
            for (let row = queue.shift(); row; row = queue.shift()) {
              const progress = track(row.name, "Starting");
              try {
                await publishRow(row, progress);
                published.add(row.id);
              } catch (err: any) {
                problems.push(`Saving "${row.name}": ${err?.message || err}`);
              } finally {
                progress.finish();
              }
            }
          })
        );

        // What was published is now saved: update those rows in place (no reload).
        const nextRows = rows.map((r) =>
          published.has(r.id)
            ? {
                ...r,
                ...(rowUpdates.get(r.id) ?? {}),
                source: "db" as const,
                dbAction: "",
                // The database now holds what's shown. Onshape too, unless writing the
                // edits failed: then the next publish retries them.
                baseline: editableValues(r),
                loaded: unsavedEdits.has(r.id) ? r.loaded : editableValues(r),
                modified: [],
              }
            : r
        );
        setRows(nextRows);
        setRootBomDB(savedRoot);
        setRootIsPublished(true);
        writeTreeCache(
          treeCacheKey(rootKey),
          { rows: nextRows, rootBomDB: savedRoot, rootBom: rootBomSummary(rootOnshapeBom) },
          treeSavedAtRef.current
        );

        client.showMessageBubble(`"${values.name}" was published to the database.`);
        if (problems.length > 0) {
          console.warn("[publish] problems:", problems);
          client.showMessageBubble(
            `${problems.length} item${problems.length === 1 ? "" : "s"} could not be fully saved ` +
              `(first: ${problems[0]}). Publish BOM again to retry.`
          );
        }
        setPublishOpen(false);
        return true;
      } catch (err: any) {
        const apiErr = err as ApiError;
        setPublishError(apiErr.message);
        client.showMessageBubble(`Publish failed: ${apiErr.message}`);
        return null; // marks the operation failed on /tele
      } finally {
        setPublishing(false);
        setPublishProgress(null);
      }
    }),
    [rootKey, client]
  );

  /**
   * Refresh BOM: reload everything from Onshape (database only for fields
   * Onshape lacks). Saves nothing, and discards edits not published yet -
   * after asking, when there are any.
   */
  const handleRefresh = useCallback(() => {
    const editedItems = currentTreeRef.current.rows.filter((r) => changedFields(r, r.loaded).length > 0);
    if (editedItems.length > 0) {
      const names = editedItems.slice(0, 5).map((r) => `• ${r.name}`).join("\n");
      const more = editedItems.length > 5 ? `\n…and ${editedItems.length - 5} more` : "";
      const ok = window.confirm(
        `Refresh BOM will discard your unpublished edits to ${editedItems.length} item${editedItems.length === 1 ? "" : "s"}:\n\n` +
          `${names}${more}\n\nPublish BOM first to keep them. Discard and refresh?`
      );
      if (!ok) return;
    }
    loadTree();
  }, [loadTree]);

  if (!rootKey) {
    return (
      <div className="p-8 text-center text-zinc-400">
        Waiting for Onshape to provide document context...
      </div>
    );
  }

  // Onshape first; the database only for what Onshape doesn't have.
  const displayName = rootOnshapeBom?.name.slice(6) || rootBomDB?.name || "Assembly";
  const pendingEditCount = rows.reduce((n, r) => n + (r.modified?.length ?? 0), 0);

  return (
    <div className="assembly-bom-page p-8 flex gap-6">
      <div className="flex-1">
        <div className="assembly-bom-header flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div>
            <h1 className="assembly-bom-title text-2xl font-bold">{displayName}</h1>
            {(rootOnshapeBom?.description || rootBomDB?.description) && (
              <p className="assembly-bom-subtitle text-zinc-500 text-sm mt-1">{rootOnshapeBom?.description || rootBomDB?.description}</p>
            )}
            {!rootIsPublished && (
              <p className="assembly-bom-unpublished-hint text-xs text-blue-500 mt-1 italic">
                This assembly isn't in the database yet - it's showing live Onshape data.
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="publish-btn-primary px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
              onClick={handleRefresh}
              disabled={loading || publishing}
              title="Reload everything from Onshape (the database only for fields Onshape doesn't have). Saves nothing; discards edits not published yet."
            >
              {loading ? "Refreshing..." : "Refresh BOM"}
            </button>

            <button
              type="button"
              className="publish-btn-primary px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
              onClick={() => setPublishOpen(true)}
              disabled={loading || publishing || rows.length === 0}
              title="Save everything shown to the database, replacing the saved data and files, and write edited cells to Onshape"
            >
              {publishing ? "Publishing..." : pendingEditCount > 0 ? `Publish BOM (${pendingEditCount} changes)` : "Publish BOM"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
            <p className="font-semibold">Error Loading BOM Data</p>
            <p>{error.message}</p>
            {error.statusCode && <p className="text-sm">HTTP Status Code: {error.statusCode}</p>}
          </div>
        )}

        {loading && rows.length === 0 ? (
          <div className="assembly-bom-progress p-8 text-center text-zinc-400">
            <p>{loadProgress ? "Resolving assembly tree..." : "Reading the BOM from Onshape..."}</p>
            {loadProgress && loadProgress.total > 0 && (
              <>
                <div className="mt-3 h-1.5 w-full max-w-xs mx-auto rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-200"
                    style={{ width: `${Math.min(100, Math.round((loadProgress.done / loadProgress.total) * 100))}%` }}
                  />
                </div>
                <p className="mt-2 text-xs">
                  {Math.min(loadProgress.done, loadProgress.total)} of {loadProgress.total} items
                </p>
                {loadProgress.current && (
                  <p className="mt-1 text-xs text-zinc-500 truncate">{loadProgress.current}</p>
                )}
              </>
            )}
          </div>
        ) : (
          <>
          {loading && (
            <div className="assembly-bom-refreshing mb-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">Refreshing from Onshape...</span>
                {loadProgress && loadProgress.total > 0 && (
                  <span className="shrink-0">
                    {Math.min(loadProgress.done, loadProgress.total)} / {loadProgress.total}
                  </span>
                )}
              </div>
              {loadProgress && loadProgress.total > 0 && (
                <div className="mt-1.5 h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-200"
                    style={{ width: `${Math.min(100, Math.round((loadProgress.done / loadProgress.total) * 100))}%` }}
                  />
                </div>
              )}
            </div>
          )}
          {publishing && publishProgress && !publishOpen && (
            <div className="assembly-bom-refreshing mb-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">
                  Publishing to the database
                  {publishProgress.active.length > 1 ? ` - ${publishProgress.active.length} items at once` : ""}
                </span>
                <span className="shrink-0">
                  {publishProgress.failed > 0 && (
                    <span className="text-amber-400 mr-2">{publishProgress.failed} problems</span>
                  )}
                  {publishProgress.done} / {publishProgress.total}
                </span>
              </div>
              <div className="mt-1.5 h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-200"
                  style={{ width: `${Math.round((publishProgress.done / Math.max(publishProgress.total, 1)) * 100)}%` }}
                />
              </div>
              {publishProgress.active.map((item, i) => (
                <div key={i} className="mt-1 truncate text-zinc-500">
                  {item.name}: {item.step}
                </div>
              ))}
            </div>
          )}
          {!loading && !publishing && cachedAt !== null && (
            <div className="assembly-bom-refreshing mb-2 text-xs text-zinc-500">
              Saved copy from {describeAge(cachedAt)}. Press Refresh BOM to reload from Onshape.
            </div>
          )}
          <Table
            data={rows}
            columnsData={columns}
            setData={(newData) => handleTableEdit(newData as AssemblyBomRow[])}
            newRowFunction={undefined}
            initialSort={{ key: "catalogNumber", direction: "asc" }}
            // Like Excel's freeze panes: header row + avatar and name stay visible.
            stickyHeader
            frozenColumns={2}
          />
          </>
        )}

        {publishOpen && (
          <PublishBomModal
            open
            mode={rootIsPublished ? "update" : "publish"}
            initialValues={{
              // Onshape first; the database for what Onshape doesn't have.
              name: displayName,
              catalogNumber: rootOnshapeBom?.partNumber || rootBomDB?.catalogNumber || "",
              description: rootOnshapeBom?.description || rootBomDB?.description || "",
              comments: rootBomDB?.comments || "",
            }}
            onCancel={() => (publishing ? undefined : setPublishOpen(false))}
            onSubmit={handlePublish}
            submitting={publishing}
            progress={publishProgress}
          />
        )}

        {publishError && !publishOpen && (
          <div className="mt-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm">
            {publishError}
          </div>
        )}
      </div>
    </div>
  );
}