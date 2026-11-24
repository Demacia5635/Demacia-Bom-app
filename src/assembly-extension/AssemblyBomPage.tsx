import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Table from "../components/Table";
import { setUpdatedBy, type ApiError } from "../util/ApiService";
import type { BomModel, PartModel } from "../util/Models";
import { useOnshapeClient, useOnshapeContext } from "../extension/onshapeHostShim";
import "../css/AssemblyBomPage.css";
import {
  upsertBomById,
  type OnshapeKey,
  syncBomThumbnailToDrive,
  getPublishedElsewhere,
  getAllRecords,
  getBomsByIds,
  getPartsByIds
} from "./BomApi";
import { onshapeJson } from "../extension/onshapeDirect";
import { catalogKey, findSameNumberGroups, isGrouped, normalizeCatalogNumber, quotedList } from "./sameParts";
import { combineSameNumber, membersOf, pickRecordRow } from "./copyRows";
import SameNumberNotice from "./SameNumberNotice";
import { usePanelThemeSetting } from "../extension/panel/theme";
import { beginImageVersionCheck, cancelImageVersionCheck, setImageVersions } from "../extension/imageCache";
import type AssemblyBomRow from "./AssemblyBomRow";
import type { OnshapeBomTable } from "./OnshapeBom";
import buildAssemblyBomColumns from "./AssemblyBomColumns";
import { childrenByParent, distinctRows, linkArrays, publishPhases, ROOT_PARENT } from "./publishPlan";
import PublishBomModal, {
  type PublishBomFormValues,
  type PublishChange,
  type PublishCheck,
  type PublishPreview,
  type PublishProgress,
} from "./PublishBomModel";
import { describeAge, readTreeCache, treeCacheKey, writeTreeCache, writeTreeCacheSoon } from "./treeCache";
import { setTelemetryAssembly, withOperation } from "../extension/telemetry";
import { describePublishError, lowerFirst } from "./publishErrors";
import { assemblyKeyId, bomIdOf, buildOnshapeElementURL, keyOf, keyString, recordId } from "./onshapeKeys";
import ConfirmModal from "./ConfirmModal";
import ProgressBar from "./ProgressBar";
import {
  deleteReplaced,
  estimateSecondsLeft,
  publishRow,
  PUBLISH_CONCURRENCY,
  replaceFile,
  timeLeftSuffix,
  type PublishRowContext,
} from "./publishTree";
import {
  assemblyNameOf,
  expandTree,
  loadSubtree,
  prefetchTree,
  REFRESH_CONCURRENCY,
  resolveBomNode,
} from "./treeLoader";
import BomToolbar from "./BomToolbar";
import BomHeader from "./BomHeader";
import { bomPageUrl, partPageUrl } from "./websiteLinks";
import { useRowContextMenu } from "../components/useRowContextMenu";
import RowMenu from "./RowMenu";
import PublishedElsewhereCover from "./PublishedElsewhereCover";
import SelectionEditBar, { type BulkField } from "./SelectionEditBar";
import { suggestFix } from "./problemFixes";
import { openExternal } from "../util/openExternal";
import { useServerStatus } from "./useServerStatus";
import { useOnshapeChangeWatch } from "./useOnshapeChangeWatch";
import { notifyPublishEnded } from "./publishNotify";
import { useEditHistory } from "./useEditHistory";
import ShortcutsHelp from "./ShortcutsHelp";
import { isTyping, SEARCH_INPUT_ID, SHORTCUTS } from "./shortcuts";
import {
  catalogNumberInName,
  changedFields,
  EDITABLE_FIELDS,
  editableValues,
  describeFieldValue,
  FIELD_LABELS,
  fileRuleForMaterial,
  isExternalRow,
  isHiddenByStandardToggle,
  isLockedRow,
  isStandardRow,
  retrackRow,
  stampOf,
} from "./rowRules";
import { findWorkOrderProblems, TOP_ASSEMBLY_ID } from "./workOrderProblems";
import {
  createCachedSources,
  createLimiter,
  LOAD_CANCELLED,
  type Limiter,
} from "./requestPool";
import { computeImageVersions, computeModelVersions, partFilesVersion, type ModelVersions } from "./modelVersions";
import { isSavedSizeStale, needsSize, readPartSize, SIZE_CONCURRENCY } from "./partSize";
import { usePersistentToggle } from "./usePersistentToggle";

function resolveWvm(context: Pick<ReturnType<typeof useOnshapeContext>, "workspaceId" | "versionId">): { wvmType: string; wvmID: string } | null {
  if (context.workspaceId) return { wvmType: "w", wvmID: context.workspaceId };
  if (context.versionId) return { wvmType: "v", wvmID: context.versionId };
  return null;
}

/** What the saved copy of a tree keeps of the root Onshape BOM. */
function rootBomSummary(bom: OnshapeBomTable | null | undefined) {
  return bom ? { id: bom.id, name: bom.name, description: bom.description || "", partNumber: bom.partNumber || "" } : null;
}

/**
 * Name of the signed-in Onshape user (the default engineer), asked once per
 * panel. "" if Onshape doesn't say; the panel then works as before.
 */
let onshapeUserNamePromise: Promise<string> | null = null;
function getOnshapeUserName(): Promise<string> {
  onshapeUserNamePromise ??= onshapeJson<{ name?: string }>("/users/sessioninfo")
    .then((info) => String(info?.name ?? "").trim())
    .catch(() => {
      onshapeUserNamePromise = null; // try again next time
      return "";
    });
  return onshapeUserNamePromise;
}

/** A resolved assembly tree: the rows plus the root's database and Onshape records. */
interface LoadedTree {
  rows: AssemblyBomRow[];
  rootBomDB: BomModel | null;
  rootOnshapeBom: OnshapeBomTable | null;
}

export default function AssemblyBomPage() {
  const context = useOnshapeContext();
  const client = useOnshapeClient({ context });

  const [rows, setRows] = useState<AssemblyBomRow[]>([]);
  /**
   * The signed-in Onshape user: the default engineer for items not in the
   * database yet. Their empty engineer cells show it greyed, Publish BOM writes
   * it (the dialog's Default engineer) for them, and their empty engineer isn't
   * a problem while it's known. Items already saved keep the saved engineer,
   * even an empty one. Not put into the rows, so it isn't counted as an
   * unpublished change.
   */
  const [onshapeUserName, setOnshapeUserName] = useState("");
  useEffect(() => {
    let cancelled = false;
    getOnshapeUserName().then((name) => {
      setUpdatedBy(name || null); // the server records who saved (X-Updated-By, ApiService)
      if (!cancelled) setOnshapeUserName(name);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [rootBomDB, setRootBomDB] = useState<BomModel | null>(null);
  const [rootIsPublished, setRootIsPublished] = useState<boolean>(false);
  const [rootOnshapeBom, setRootOnshapeBom] = useState<OnshapeBomTable | null>(null);

  /** Tree-loading progress; null until the root BOM has been read. */
  const [loadProgress, setLoadProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  /** When the rows on screen come from the saved copy: when it was saved. */
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  /** When the tree on screen was read from Onshape (for "Loaded 5 min ago"). */
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  /** Our server's status dot (checked on open and before Publish). */
  const { status: serverStatus, check: checkServer } = useServerStatus();
  /** When the tree on screen was loaded from Onshape (kept when edits update the saved copy). Set by every load. */
  const treeSavedAtRef = useRef<number>(0);
  /** The tree on screen, for handlePublish when it isn't handed a freshly loaded one. */
  const currentTreeRef = useRef<LoadedTree>({ rows: [], rootBomDB: null, rootOnshapeBom: null });
  // Kept in step with the state after every render (handlers read it, not render).
  useLayoutEffect(() => {
    currentTreeRef.current = { rows, rootBomDB, rootOnshapeBom };
  });

  const [publishOpen, setPublishOpen] = useState(false);
  /** Progress of a running Publish / Update BOM; null when idle. */
  const [publishProgress, setPublishProgress] = useState<PublishProgress | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  /**
   * Each loadTree call gets a number; a load is stale once a newer one starts
   * or this page goes away (the panel remounts it when the Onshape tab shows
   * another element). A stale load sends no more requests and leaves the
   * shared image versions and telemetry label alone: they belong to the
   * current page now.
   */
  const loadSeqRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Memoized on the ID strings: a new object every render made loadTree (and
  // its effect) change every render, reloading the tree endlessly.
  const { documentId, workspaceId, versionId, elementId } = context;
  const rootKey: OnshapeKey | null = useMemo(() => {
    const wvm = resolveWvm({ workspaceId, versionId });
    return documentId && wvm && elementId
      ? { documentID: documentId, wvmType: wvm.wvmType, wvmID: wvm.wvmID, elementID: elementId }
      : null;
  }, [documentId, workspaceId, versionId, elementId]);

  /** Shows `nextRows` and keeps the saved copy in step, so edits survive closing the panel. */
  const saveRows = useCallback(
    (nextRows: AssemblyBomRow[]) => {
      setRows(nextRows);
      currentTreeRef.current = { ...currentTreeRef.current, rows: nextRows };
      if (rootKey) {
        const { rootBomDB: savedRoot, rootOnshapeBom: onshapeRoot } = currentTreeRef.current;
        // Called on every edit/expand: written once edits pause.
        writeTreeCacheSoon(
          treeCacheKey(rootKey),
          { rows: nextRows, rootBomDB: savedRoot, rootBom: rootBomSummary(onshapeRoot) },
          treeSavedAtRef.current
        );
      }
    },
    [rootKey]
  );

  /** Undo / redo of table edits (Ctrl+Z / Ctrl+Y), until the next load or publish. */
  const currentRows = useCallback(() => currentTreeRef.current.rows, []);
  const history = useEditHistory(currentRows, saveRows);
  const { record: recordEdit, clear: clearHistory } = history;

  /**
   * The server keeps one BOM per assembly: when this one was already published
   * from another workspace / version of its document, the whole panel is
   * covered (PublishedElsewhereCover). Asked once per assembly; an older
   * server (no such route) changes nothing.
   */
  const [publishedElsewhere, setPublishedElsewhere] = useState<{ key: string; bom: BomModel } | null>(null);
  useEffect(() => {
    if (!rootKey) return;
    let cancelled = false;
    const asked = keyString(rootKey);
    getPublishedElsewhere(rootKey).then((answer) => {
      if (cancelled) return;
      setPublishedElsewhere(answer?.elsewhere && answer.bom ? { key: asked, bom: answer.bom } : null);
    });
    return () => {
      cancelled = true;
    };
  }, [rootKey]);
  /** Only for the assembly it was asked about (the panel can switch to another one). */
  const elsewhereBom = publishedElsewhere && rootKey && publishedElsewhere.key === keyString(rootKey) ? publishedElsewhere.bom : null;
  const elsewhereUrl = elsewhereBom
    ? elsewhereBom.onshapeURL ||
      (elsewhereBom.onshapeID ? buildOnshapeElementURL(context.server, elsewhereBom.onshapeID) : null)
    : null;

  /** "Onshape changed since loaded": watched while a tree from Onshape is on screen and idle. */
  const { changed: onshapeChanged, restart: restartChangeWatch } = useOnshapeChangeWatch({
    rootKey,
    rows,
    active: !loading && !publishing && cachedAt === null && rows.length > 0,
  });

  /**
   * Loads the assembly tree from Onshape + the database and returns it (null
   * on failure). With `preferCache`, a saved copy is shown instead when there
   * is one, without contacting Onshape: opening an assembly doesn't reload it;
   * the Refresh button does.
   */
  const loadTree = useCallback(async (options: { preferCache?: boolean } = {}): Promise<LoadedTree | null> => {
    if (!rootKey) return null;
    const loadId = ++loadSeqRef.current;
    const stale = () => !mountedRef.current || loadSeqRef.current !== loadId;

    setLoading(true);
    setError(null);
    setPublishError(null);
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
        setLoadedAt(cached.savedAt);
        restartChangeWatch();
        clearHistory();
        setTelemetryAssembly(assemblyNameOf(cached.rootBom) || cached.rootBomDB?.name || "", rootKey.documentID, rootKey.elementID);
        treeSavedAtRef.current = cached.savedAt;
        setLoading(false);
        // Images of unchanged models come from the image store; only changed ones render.
        void withOperation("Check for model changes", () =>
          computeImageVersions(cached.rows, createLimiter(REFRESH_CONCURRENCY, stale))
        ).then(
          (versions) => {
            if (!stale()) setImageVersions(versions);
          },
          () => {
            if (!stale()) cancelImageVersionCheck();
          }
        );
        return null;
      }
    }

    // A load from Onshape is one "Refresh BOM" operation on the footprint page (/tele).
    return withOperation("Refresh BOM", async () => {
    // Requests run in parallel (at most REFRESH_CONCURRENCY at once) through a
    // per-load cache: a prefetch downloads everything ahead while the walk
    // below builds the rows in the same order as before.
    const limit = createLimiter(REFRESH_CONCURRENCY, stale);
    const src = createCachedSources(limit);


    const visitedBomIds = new Set<string>();
    const allRows: AssemblyBomRow[] = [];

    try {
      const { node: rootNode, dbBom } = await resolveBomNode(context.server, rootKey, null, 'root', undefined, src);
      if (stale()) throw LOAD_CANCELLED;
      if (rootNode.onshapeBom) void prefetchTree(rootNode.onshapeBom, src);
      setTelemetryAssembly(assemblyNameOf(rootNode.onshapeBom) || dbBom?.name || "", rootKey.documentID, rootKey.elementID);
      visitedBomIds.add(assemblyKeyId(rootKey));

      // The root BOM is multi-level, so its item count covers the whole tree
      // (an estimate: repeated sub-assemblies are resolved only once).
      const total = rootNode.onshapeBom?.items?.length ?? 0;
      setLoadProgress({ done: 0, total, current: "" });

      await expandTree(rootNode, true, {
        server: context.server,
        src,
        rootBomDB: dbBom,
        visited: visitedBomIds,
        out: allRows,
        onItem: (name) => setLoadProgress({ done: allRows.length, total, current: name }),
      }, new Set([assemblyKeyId(rootKey)]));
      // A refresh discards unpublished edits (handleRefresh asks first).
      // Current model versions (one request per document): which row images
      // changed since they were stored, and which saved sizes are out of date.
      const modelVersions = await computeModelVersions(allRows, limit).catch(
        (): ModelVersions => ({ byRow: new Map(), tree: null })
      );
      const freshRows = allRows.map((r) =>
        isSavedSizeStale(r, partFilesVersion(r, modelVersions)) ? { ...r, size: undefined, sizeVersion: undefined } : r
      );
      const imageVersions = await computeImageVersions(freshRows, limit, modelVersions).catch(() => new Map<string, string>());
      if (stale()) throw LOAD_CANCELLED;
      setImageVersions(imageVersions);
      // The new top assembly is shown together with its rows, so a load that
      // fails halfway leaves the previous tree on screen as it was.
      setRootBomDB(dbBom);
      setRootIsPublished(Boolean(dbBom));
      setRootOnshapeBom(rootNode.onshapeBom ?? null);
      setRows(freshRows);
      setCachedAt(null);
      treeSavedAtRef.current = Date.now();
      setLoadedAt(treeSavedAtRef.current);
      restartChangeWatch(); // these models are the new starting point
      clearHistory();
      writeTreeCache(cacheKey, {
        rows: freshRows,
        rootBomDB: dbBom,
        rootBom: rootBomSummary(rootNode.onshapeBom),
      });
      return { rows: freshRows, rootBomDB: dbBom, rootOnshapeBom: rootNode.onshapeBom ?? null };
    } catch (err: any) {
      // A replaced load just stops: the newer load (or page) owns the screen and the image check.
      if (stale()) return null;
      setError(err as ApiError);
      cancelImageVersionCheck(); // don't keep images waiting for a check that won't come
      return null;
    } finally {
      if (!stale()) setLoading(false);
    }
    });
  }, [rootKey, context.server, restartChangeWatch, clearHistory]);

  // Opening an assembly: show its saved copy if there is one; otherwise load it.
  useEffect(() => {
    if (rootKey) {
      // Loading is syncing with Onshape and the database: its loading state is set right away.
      // eslint-disable-next-line react/set-state-in-effect
      loadTree({ preferCache: true });
    }
  }, [rootKey, loadTree]);

  /**
   * Work-order readiness: what would stop "Create work order" on the website
   * for each part (same rules as CreatingWO), by row ID then column.
   */
  /** The top assembly's name and catalog number (Onshape first; a name that is a number fills an empty one). */
  const topAssembly = useMemo(() => {
    const name = assemblyNameOf(rootOnshapeBom) || rootBomDB?.name || "Assembly";
    const number = rootOnshapeBom?.partNumber || rootBomDB?.catalogNumber || catalogNumberInName(name) || "";
    return { name, number };
  }, [rootOnshapeBom, rootBomDB]);
  const workOrderProblems = useMemo(() => findWorkOrderProblems(rows, topAssembly, onshapeUserName), [rows, topAssembly, onshapeUserName]);
  const topProblem = workOrderProblems.get(TOP_ASSEMBLY_ID)?.get("catalogNumber");
  const problemCount = useMemo(
    () => Array.from(workOrderProblems.values()).reduce((n, byField) => n + byField.size, 0),
    [workOrderProblems]
  );

  /** Light / dark (theme.ts), switched by the header's theme button like the website's. */
  const theme = usePanelThemeSetting();
  /** "Show size": the Size column, filled from Onshape (remembered in this browser). */
  const [showSize, setShowSize] = usePersistentToggle("showSize");

  /** Sub-assemblies whose insides are being loaded after their standard mark was removed. */
  const [subtreeLoads, setSubtreeLoads] = useState(0);

  /**
   * While "Show size" is on, reads the size of every made part that has none
   * yet, at most SIZE_CONCURRENCY at a time. Results are put into the rows
   * shown at that moment (by row ID), a few at a time. A failed read leaves ""
   * (blank cell); Publish BOM tries again and never saves "".
   */
  const sizeLimitRef = useRef<Limiter | null>(null);
  const sizeRequestedRef = useRef(new Set<string>());
  /** A load or publish replaces the rows: sizes arriving then are dropped (and read again after). */
  const sizeBusyRef = useRef(false);
  useLayoutEffect(() => {
    sizeBusyRef.current = loading || publishing;
  });
  /** Bumped when "Show size" is unticked or the panel closes: reads from before are dropped. */
  const sizeRunRef = useRef(0);
  useEffect(() => {
    if (!showSize) return;
    const requested = sizeRequestedRef.current;
    return () => {
      sizeRunRef.current += 1;
      requested.clear();
    };
  }, [showSize]);
  useEffect(() => {
    if (!showSize || loading || publishing) return;
    const limit = (sizeLimitRef.current ??= createLimiter(SIZE_CONCURRENCY));
    const requested = sizeRequestedRef.current;
    const run = sizeRunRef.current;
    const cancelled = () => sizeRunRef.current !== run;
    const pending = new Map<string, string>();
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      flushTimer = undefined;
      if (pending.size === 0 || sizeBusyRef.current || cancelled()) return pending.clear();
      const done = new Map(pending);
      pending.clear();
      saveRows(currentTreeRef.current.rows.map((r) => (done.has(r.id) && r.size === undefined ? { ...r, size: done.get(r.id)! } : r)));
    };
    for (const row of rows) {
      if (!needsSize(row) || row.size !== undefined) continue;
      const requestKey = `${row.id}|${row.configuration ?? ""}`;
      if (requested.has(requestKey)) continue;
      requested.add(requestKey);
      limit(() => readPartSize(row, cancelled))
        .catch(() => "")
        .then((size) => {
          if (cancelled()) return; // unticked or closed meanwhile
          requested.delete(requestKey);
          pending.set(row.id, size);
          flushTimer ??= setTimeout(flush, 300);
        });
    }
  }, [showSize, rows, loading, publishing, saveRows]);

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
      /** A cell value changed (not just a row expanded or collapsed): undoable. */
      let edited = false;

      // Sub-assemblies whose standard-part mark changed in this edit.
      const markedNow: AssemblyBomRow[] = [];
      const unmarkedNow: AssemblyBomRow[] = [];

      let nextRows = newData.map((row) => {
        const prev = previousById.get(row.id);
        if (!prev) return row;
        const editedKeys = EDITABLE_FIELDS.filter(
          (k) => (row as unknown as Record<string, unknown>)[k] !== (prev as unknown as Record<string, unknown>)[k]
        );
        if (editedKeys.length === 0) return row; // e.g. expanding/collapsing a row
        // Standard Content / vendor parts: nothing editable. Marked standard: only
        // the mark (to undo it). Mid-refresh or mid-publish edits would be lost.
        const refused = editedKeys.filter(
          (k) =>
            loading || publishing || subtreeLoads > 0 || isExternalRow(prev) || (prev.markedStandard && k !== "markedStandard")
        );
        if (refused.length < editedKeys.length) edited = true;
        if (refused.length > 0) {
          blocked = true;
          row = { ...row, ...Object.fromEntries(refused.map((k) => [k, (prev as unknown as Record<string, unknown>)[k]])) } as AssemblyBomRow;
        }
        // A part's new material re-ticks its files (polycarbonate -> Parasolid...);
        // a material with no rule leaves the ticks. They can still be changed after.
        if (!row.isAssembly && editedKeys.includes("material") && !refused.includes("material")
          && !editedKeys.includes("wantStl") && !editedKeys.includes("wantParasolid")) {
          const rule = fileRuleForMaterial(String(row.material ?? ""));
          if (rule) row = { ...row, ...rule };
        }
        // (Table writes an edit to every row with this id, i.e. every use of the
        // item; each sub-assembly is listed once here.)
        if (row.isAssembly && !!row.markedStandard !== !!prev.markedStandard) {
          const list = row.markedStandard ? markedNow : unmarkedNow;
          if (!list.some((r) => r.id === row.id)) list.push(row);
        }
        // Marked only while it differs from the saved (or loaded) value: typing
        // something and then removing it leaves the cell unmarked.
        return { ...row, modified: changedFields(row, row.baseline ?? row.loaded) };
      });

      if (blocked && (loading || publishing || subtreeLoads > 0)) {
        client.showMessageBubble("Wait until the refresh, publish or loading has finished, then edit again.");
      }

      // A sub-assembly marked standard is one bought item: its insides go.
      if (markedNow.length > 0) {
        const childrenOf = new Map<string, string[]>();
        for (const r of nextRows) if (r.parentId) childrenOf.set(r.parentId, [...(childrenOf.get(r.parentId) ?? []), r.id]);
        const drop = new Set<string>();
        const collect = (id: string) => {
          for (const child of childrenOf.get(id) ?? []) {
            if (!drop.has(child)) {
              drop.add(child);
              collect(child);
            }
          }
        };
        markedNow.forEach((r) => collect(r.id));
        nextRows = nextRows.filter((r) => !drop.has(r.id));
      }

      if (edited) recordEdit(rows);
      saveRows(nextRows);

      // Unmarked: its insides weren't loaded while it was marked - load them now.
      for (const row of unmarkedNow) {
        if (nextRows.some((r) => r.parentId === row.id)) continue;
        setSubtreeLoads((n) => n + 1);
        void loadSubtree(row, nextRows, {
          server: context.server,
          rootKey,
          rootBomDB: currentTreeRef.current.rootBomDB,
          isCancelled: () => !mountedRef.current,
        })
          .then((children) => {
            if (!mountedRef.current) return; // panel closed: don't touch the saved copy
            const current = currentTreeRef.current.rows;
            // Still unmarked (and still there)? Then add its insides.
            if (!current.some((r) => r.id === row.id && !r.markedStandard)) return;
            // Already has them (e.g. a Refresh reloaded the tree meanwhile):
            // adding them again would duplicate the rows.
            if (current.some((r) => r.parentId === row.id)) return;
            saveRows([...current, ...children]);
          })
          .catch((err: any) => {
            if (!mountedRef.current) return;
            client.showMessageBubble(`Couldn't load the parts of "${row.name}": ${err?.message || err}. Press Refresh BOM.`);
          })
          .finally(() => setSubtreeLoads((n) => n - 1));
      }
    },
    [rows, client, loading, publishing, subtreeLoads, saveRows, context.server, rootKey, recordEdit]
  );

  /**
   * Catalog numbers used by several items of the tree (sameParts.ts): the
   * same name = the same part, which the user can combine here; different
   * names = a mistake, flagged as a problem, combined only if the user says
   * so. Listed above the table and again in the Publish dialog.
   */
  const sameNumberGroups = useMemo(() => findSameNumberGroups(rows), [rows]);

  /** "Combine": the parts with these catalog numbers become one part (copyRows.ts). An edit, saved on Publish BOM. */
  const combineGroups = useCallback(
    (keys: string[]) => {
      if (loading || publishing || subtreeLoads > 0) {
        client.showMessageBubble("Wait until the refresh, publish or loading has finished, then combine again.");
        return;
      }
      recordEdit(rows);
      saveRows(combineSameNumber(rows, new Set(keys), retrackRow));
    },
    [rows, loading, publishing, subtreeLoads, client, saveRows, recordEdit]
  );

  /** Search box: rows whose name, catalog number or description contain the text. */
  const [search, setSearch] = useState("");
  /** "N problems" button: show only parts that would stop a work order. */
  const [problemsOnly, setProblemsOnly] = useState(false);
  const searchFilter = useMemo(() => {
    const q = search.trim().toLowerCase();
    const showProblems = problemsOnly && problemCount > 0;
    if (!q && !showProblems) return undefined;
    return (row: AssemblyBomRow) =>
      (!showProblems || workOrderProblems.has(row.id)) &&
      (!q || [row.name, row.catalogNumber, row.description].some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [search, problemsOnly, problemCount, workOrderProblems]);
  const searchMatchCount = useMemo(() => (searchFilter ? rows.filter(searchFilter).length : 0), [rows, searchFilter]);

  /**
   * Publish preview: counts what Publish BOM will do with the tree on screen.
   * Same item rules as handlePublish (a part used in several places once;
   * Standard Content gets no STL / Parasolid).
   */
  const publishPreview = useMemo((): PublishPreview | null => {
    if (!publishOpen) return null;
    const items = distinctRows(rows);
    const preview: PublishPreview = {
      items: 1 + items.length,
      newItems: (rootIsPublished ? 0 : 1) + items.filter((r) => r.source !== "db").length,
      editedCells: rows.reduce((n, r) => n + (r.modified?.length ?? 0), 0),
      stl: 0,
      parasolid: 0,
      newFiles: 0,
      filesToDelete: 0,
    };
    for (const r of items) {
      if (r.isAssembly) continue;
      const wantStl = !isStandardRow(r) && !!r.wantStl;
      const wantParasolid = !isStandardRow(r) && !!r.wantParasolid;
      if (wantStl) preview.stl++;
      if (wantParasolid) preview.parasolid++;
      if (wantStl && !r.saved?.stlLink) preview.newFiles++;
      if (wantParasolid && !r.saved?.parasolidLink) preview.newFiles++;
      if (!wantStl && r.saved?.stlLink) preview.filesToDelete++;
      if (!wantParasolid && r.saved?.parasolidLink) preview.filesToDelete++;
    }
    return preview;
  }, [publishOpen, rows, rootIsPublished]);

  /** Every edited cell of the items Publish will save, for the dialog's "Changes" list. */
  const publishChanges = useMemo((): PublishChange[] => {
    if (!publishOpen) return [];
    const list: PublishChange[] = [];
    for (const r of distinctRows(rows)) {
      const was = (r.baseline ?? r.loaded ?? {}) as Record<string, unknown>;
      const now = r as unknown as Record<string, unknown>;
      for (const field of r.modified ?? []) {
        list.push({
          item: String(r.name ?? ""),
          field: FIELD_LABELS[field] ?? field,
          from: describeFieldValue(field, was[field]),
          to: describeFieldValue(field, now[field]),
        });
      }
    }
    return list;
  }, [publishOpen, rows]);

  /** "Hide standard parts" / "Hide standard assemblies" (remembered in this browser). */
  const [hideStandardParts, setHideStandardParts] = usePersistentToggle("hideStandardParts");
  const [hideStandardAssemblies, setHideStandardAssemblies] = usePersistentToggle("hideStandardAssemblies");
  const hideRow = useMemo(() => {
    if (!hideStandardParts && !hideStandardAssemblies) return undefined;
    return (row: AssemblyBomRow) =>
      row.isAssembly ? hideStandardAssemblies && !!row.markedStandard : hideStandardParts && isHiddenByStandardToggle(row);
  }, [hideStandardParts, hideStandardAssemblies]);
  const standardPartCount = useMemo(() => rows.filter((r) => !r.isAssembly && isHiddenByStandardToggle(r)).length, [rows]);
  const standardAssemblyCount = useMemo(() => rows.filter((r) => r.isAssembly && r.markedStandard).length, [rows]);

  /**
   * Puts edited rows back to their saved values (or, for items not saved yet,
   * what was loaded): the rows with these IDs, or every edited row. Goes
   * through the normal edit, so it can be undone and a standard mark's
   * insides come back.
   */
  const revertRows = useCallback(
    (ids: ReadonlySet<string> | null) => {
      const next = rows.map((r) =>
        !r.modified?.length || (ids && !ids.has(r.id)) ? r : ({ ...r, ...(r.baseline ?? r.loaded ?? {}) } as AssemblyBomRow)
      );
      handleTableEdit(next);
    },
    [rows, handleTableEdit]
  );
  const revertRow = useCallback((row: AssemblyBomRow) => revertRows(new Set([row.id])), [revertRows]);

  /**
   * Right-click on a row: 💡 a suggested fix for the clicked red cell
   * (problemFixes.ts, an ordinary undoable edit), "Open on the website" for
   * items in the database, and "Copy Onshape link". Shift+right-click keeps
   * the browser's own menu (copy / paste in a cell).
   */
  const { menu: rowMenu, openFor: openRowMenu, close: closeRowMenu } = useRowContextMenu<AssemblyBomRow>();
  const [rowMenuField, setRowMenuField] = useState<string | null>(null);
  const onTableContextMenu = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const target = e.target as HTMLElement;
      if (e.shiftKey || !target.closest("tr[data-row-id]")) return; // header, or the browser's menu
      setRowMenuField(target.closest("td")?.dataset.colKey ?? null);
      const byId = new Map(rows.map((r) => [r.id, r]));
      openRowMenu(e, (tr) => byId.get((tr as HTMLElement).dataset.rowId ?? ""));
    },
    [rows, openRowMenu]
  );
  /** Rows covered by the table's cell selection (the "N rows selected" bar shows for 2 or more). */
  const [selectedRows, setSelectedRows] = useState<AssemblyBomRow[]>([]);
  const selectedEditable = useMemo(() => selectedRows.filter((r) => !isLockedRow(r)), [selectedRows]);
  /** Sets one cell on every selected row it applies to (a normal edit: Ctrl+Z undoes it). */
  const setOnSelected = useCallback(
    (field: BulkField, value: string | boolean) => {
      const partsOnly = field !== "engineer"; // material and files are for parts
      const ids = new Set(selectedEditable.filter((r) => !partsOnly || !r.isAssembly).map((r) => r.id));
      if (ids.size === 0) return;
      handleTableEdit(rows.map((r) => (ids.has(r.id) ? ({ ...r, [field]: value } as AssemblyBomRow) : r)));
    },
    [selectedEditable, rows, handleTableEdit]
  );

  /** Puts `value` in the `field` cell of every use of the item (a normal edit). */
  const applyFix = useCallback(
    (row: AssemblyBomRow, field: string, value: string) => {
      handleTableEdit(rows.map((r) => (r.id === row.id ? ({ ...r, [field]: value } as AssemblyBomRow) : r)));
    },
    [rows, handleTableEdit]
  );
  /** The right-clicked cell's problem, and the fix offered for it. */
  const rowMenuProblem = rowMenu && rowMenuField ? workOrderProblems.get(rowMenu.row.id)?.get(rowMenuField) : undefined;
  const rowMenuFix = useMemo(
    () => (rowMenu && rowMenuField && rowMenuProblem ? suggestFix(rowMenu.row, rowMenuField, rows, onshapeUserName) : null),
    [rowMenu, rowMenuField, rowMenuProblem, rows, onshapeUserName]
  );
  const applyRowMenuFix = useCallback(() => {
    if (rowMenu && rowMenuFix) applyFix(rowMenu.row, rowMenuFix.field, rowMenuFix.value);
  }, [rowMenu, rowMenuFix, applyFix]);
  const copyText = useCallback(
    (text: string, what: string) => {
      navigator.clipboard.writeText(text).then(
        () => client.showMessageBubble(`${what} copied.`),
        () => client.showMessageBubble(`Couldn't copy the ${what.toLowerCase()}.`)
      );
    },
    [client]
  );

  // Rebuilt when the problems change (after edits): cheap, the table only
  // re-reads its column list.
  const columns = useMemo(
    () =>
      buildAssemblyBomColumns(
        (row, key) => workOrderProblems.get(row.id)?.get(key),
        onshapeUserName,
        showSize,
        // Only called on a click, not while rendering (it reads refs then).
        // eslint-disable-next-line react/refs
        revertRow
      ),
    [workOrderProblems, onshapeUserName, showSize, revertRow]
  );
  /** Items with edits (each counted once, wherever it's used). */
  const editedItemCount = useMemo(() => new Set(rows.filter((r) => r.modified?.length).map((r) => r.id)).size, [rows]);
  const [confirmRevertAll, setConfirmRevertAll] = useState(false);
  /** "Revert all": asks first when more than 5 items were edited. */
  const onRevertAll = useCallback(() => {
    if (editedItemCount > 5) setConfirmRevertAll(true);
    else revertRows(null);
  }, [editedItemCount, revertRows]);

  /** Expand all / Collapse all (kept in the saved copy like any other expand). */
  const setAllExpanded = useCallback(
    (expanded: boolean) => handleTableEdit(rows.map((r) => (r.isExpanded === expanded ? r : { ...r, isExpanded: expanded }))),
    [rows, handleTableEdit]
  );

  /**
   * Publish BOM: writes the tree on screen to the database, replacing what is
   * saved there. Every assembly and part is written in full with a fresh
   * thumbnail, STL and Parasolid; the Drive files they replace are deleted.
   * Cells edited in the table are written to Onshape first, so Onshape stays
   * the source. Items are saved bottom-up (parts, then sub-assemblies deepest
   * first, then the top assembly), and an assembly is skipped when something
   * inside it wasn't saved, so no record links to one that doesn't exist.
   * It does not reload from Onshape: the table is updated in place.
   */
  const handlePublish = useCallback(
    async (values: PublishBomFormValues) => withOperation("Publish BOM", async () => {
      const { rows, rootBomDB, rootOnshapeBom } = currentTreeRef.current;
      if (!rootKey || !rootOnshapeBom) return;
      setPublishing(true);
      setPublishError(null);

      const rootID = rootBomDB?.id || recordId(rootKey, bomIdOf(rootOnshapeBom, rootKey));

      const rootRowId = ROOT_PARENT;

      // Every use of every item, by parent: links come from all uses, each with its own quantity.
      const childrenByParentRowId = childrenByParent(rows);
      const buildLinkArrays = (parentRowId: string) => linkArrays(childrenByParentRowId.get(parentRowId) ?? []);

      // The top assembly, each distinct sub-assembly and each distinct part is
      // one item: one used in several places is saved once.
      const rowsToPublish = distinctRows(rows);
      const total = 1 + rowsToPublish.length;

      // Progress: items done, and what each item being worked on is doing.
      const startedAt = Date.now();
      let done = 0;
      let nextTrackId = 0;
      const active = new Map<number, { name: string; step: string }>();
      // Problems don't stop the publish; they're reported at the end.
      const problems: string[] = [];
      const report = () =>
        setPublishProgress({
          done,
          total,
          active: Array.from(active.values()),
          failed: problems.length,
          secondsLeft: estimateSecondsLeft(startedAt, done, total),
        });
      const track = (name: string, step: string) => {
        const id = nextTrackId++;
        active.set(id, { name, step });
        report();
        return {
          step: (next: string) => {
            active.set(id, { name, step: next });
            report();
          },
          /** The step it is on, for saying where a failure happened. */
          current: () => active.get(id)?.step ?? "",
          finish: () => {
            active.delete(id);
            done += 1;
            report();
          },
        };
      };

      // The Onshape host this tab is on (enterprise users aren't on cad.onshape.com).
      const onshapeUrlOf = (k: OnshapeKey) => buildOnshapeElementURL(context.server, k);

      try {
        const isUpdate = Boolean(rootBomDB);
        const rootTrack = track(values.name, "Checking which models changed");
        // Current model versions: files made from an unchanged model are kept,
        // not exported again (one request per document). Unknown -> export.
        const versions = await computeModelVersions(rows, createLimiter(REFRESH_CONCURRENCY)).catch(
          (): ModelVersions => ({ byRow: new Map(), tree: null })
        );

        // Someone else may have published these items since this copy was loaded
        // (e.g. it's a saved copy from days ago). Publishing it would overwrite
        // their data and delete Drive files their records now use, so stop and
        // say which items changed. Nothing has been written yet.
        rootTrack.step("Checking for newer publishes");
        const assemblyIds = [rootID, ...rowsToPublish.filter((r) => r.isAssembly).map((r) => r.id)];
        const partIds = rowsToPublish.filter((r) => !r.isAssembly).map((r) => r.id);
        const [freshBoms, freshParts] = await Promise.all([getBomsByIds(assemblyIds), getPartsByIds(partIds)]);
        const freshBomStamp = new Map(freshBoms.map((b) => [b.id, stampOf(b.updatedAt)]));
        const freshPartStamp = new Map(freshParts.map((p) => [p.id, stampOf(p.updatedAt)]));
        /** Changed since loaded: saved by someone else, or newly saved when it wasn't. (Deleted doesn't count.) */
        const changedSince = (fresh: string | undefined, loaded: string | undefined) => !!fresh && fresh !== (loaded || "");
        const newer = [
          ...(changedSince(freshBomStamp.get(rootID), stampOf(rootBomDB?.updatedAt)) ? [values.name] : []),
          ...rowsToPublish
            .filter((r) => changedSince((r.isAssembly ? freshBomStamp : freshPartStamp).get(r.id), r.dbUpdatedAt))
            .map((r) => r.name),
        ];
        if (newer.length > 0) {
          const names = newer.slice(0, 3).map((n) => `"${n}"`).join(", ");
          const more = newer.length > 3 ? ` and ${newer.length - 3} more` : "";
          const message =
            `Not published: someone published ${names}${more} again after this copy was loaded, ` +
            `so publishing now would overwrite their changes. Nothing was changed. ` +
            `Close this dialog, press Refresh BOM to load the latest, then publish again.`;
          // Shown inside the dialog, which stays open.
          setPublishError(message);
          client.showMessageBubble(message);
          notifyPublishEnded(startedAt, `Publish BOM of "${values.name}" stopped`, message);
          return null; // marks the operation failed on /tele
        }

        // The top assembly is saved last, once everything it links to is (see below).
        rootTrack.step("Waiting for the items inside it");

        // What changed per row, applied to the table at the end.
        const rowUpdates = new Map<string, Partial<AssemblyBomRow>>();
        // Rows whose edits could not be written to Onshape stay marked.
        const unsavedEdits = new Set<string>();

        const publishCtx: PublishRowContext = {
          rows,
          versions,
          defaultEngineer: values.defaultEngineer,
          onshapeUrlOf,
          linksOf: buildLinkArrays,
          problems,
          unsavedEdits,
          rowUpdates,
        };

        // Children are saved before their parents, so a saved assembly never links
        // to a record that doesn't exist. An assembly with a child that wasn't
        // saved isn't saved either (its old record, if any, stays as it was):
        // saving it without that link would misstate what's in it.
        const published = new Set<string>();
        /** Items not saved this time: failed, or skipped because something inside failed. */
        const notSaved = new Set<string>();
        /** Why each of those wasn't saved (`problems` also has non-fatal ones, like a failed thumbnail). */
        const saveFailures: string[] = [];
        const failSave = (row: AssemblyBomRow, reason: string) => {
          notSaved.add(row.id);
          saveFailures.push(reason);
          problems.push(reason);
        };
        const blockedBy = (parentRowId: string) =>
          (childrenByParentRowId.get(parentRowId) ?? []).filter((c) => notSaved.has(c.id));

        /** Publishes `items` up to PUBLISH_CONCURRENCY at once. One failing doesn't stop the others. */
        const publishAll = async (items: AssemblyBomRow[]) => {
          const queue = [...items];
          await Promise.all(
            Array.from({ length: Math.min(PUBLISH_CONCURRENCY, queue.length) }, async () => {
              for (let row = queue.shift(); row; row = queue.shift()) {
                const progress = track(row.name, "Starting");
                try {
                  const blocked = row.isAssembly && !row.markedStandard ? blockedBy(row.id) : [];
                  if (blocked.length > 0) {
                    failSave(row, `"${row.name}" not saved: "${blocked[0].name}" inside it wasn't saved`);
                    continue;
                  }
                  await publishRow(row, progress, publishCtx);
                  published.add(row.id);
                } catch (err: any) {
                  failSave(row, `"${row.name}" failed while ${lowerFirst(progress.current())}: ${describePublishError(err)}`);
                } finally {
                  progress.finish();
                }
              }
            })
          );
        };

        // 1. Parts and sub-assemblies marked standard, then 2. the other
        // sub-assemblies, each after everything inside it (publishPlan.ts).
        for (const phase of publishPhases(rows)) await publishAll(phase);

        // What was published is now saved: update those rows in place (no reload).
        // Rows expanded or collapsed during the publish keep their new state
        // (cell edits are blocked while publishing; expanding isn't).
        const expandedNow = new Map(currentTreeRef.current.rows.map((r) => [r.id, r.isExpanded]));
        const nextRows = rows.map((snapshot) => {
          const isExpanded = expandedNow.get(snapshot.id) ?? snapshot.isExpanded;
          return isExpanded === snapshot.isExpanded ? snapshot : { ...snapshot, isExpanded };
        }).map((r) =>
          published.has(r.id)
            ? {
                ...r,
                ...(rowUpdates.get(r.id) ?? {}),
                source: "db" as const,
                // The database now holds what's shown. Onshape too, unless writing the
                // edits failed: then the next publish retries them.
                baseline: editableValues(r),
                loaded: unsavedEdits.has(r.id) ? r.loaded : editableValues(r),
                modified: [],
              }
            : r
        );
        // Kept before the top assembly is saved, so a failure there doesn't lose them.
        setRows(nextRows);
        currentTreeRef.current = { ...currentTreeRef.current, rows: nextRows };
        writeTreeCache(
          treeCacheKey(rootKey),
          { rows: nextRows, rootBomDB, rootBom: rootBomSummary(rootOnshapeBom) },
          treeSavedAtRef.current
        );

        // 3. The top assembly, last.
        const rootBlocked = blockedBy(rootRowId);
        if (rootBlocked.length > 0) {
          rootTrack.finish();
          // saveFailures is in completion order, so its first entry is a real
          // failure (a skip is always recorded after the failure that caused it).
          const others = problems.length - saveFailures.length;
          const message =
            `"${values.name}" was not saved, because ${notSaved.size} item${notSaved.size === 1 ? "" : "s"} in it ` +
            `could not be saved. First: ${saveFailures[0]}` +
            (others > 0 ? ` ${others} other problem${others === 1 ? "" : "s"} (see the console).` : "") +
            ` The items that were saved are kept.`;
          console.warn("[publish] problems:", problems);
          // Shown inside the dialog, which stays open.
          setPublishError(message);
          client.showMessageBubble(message);
          notifyPublishEnded(startedAt, `Publish BOM of "${values.name}" stopped`, message);
          return null; // marks the operation failed on /tele
        }
        rootTrack.step(isUpdate ? "Replacing the saved assembly" : "Saving the assembly");
        const rootLinks = buildLinkArrays(rootRowId);
        const rootToDelete: string[] = [];
        const rootUnchanged = !!versions.tree && rootBomDB?.filesModelVersion === versions.tree && !!rootBomDB?.avatarID;
        const rootAvatar = rootUnchanged ? null : await syncBomThumbnailToDrive(rootKey, values.name);
        if (!rootUnchanged && !rootAvatar) problems.push(`Thumbnail of "${values.name}"`);
        const savedRoot = await upsertBomById(rootID, {
          id: rootID,
          name: values.name,
          description: values.description,
          comments: values.comments,
          catalogNumber: values.catalogNumber,
          // Saved: keep its engineer. New: the dialog's Default engineer.
          engineer: rootBomDB ? rootBomDB.engineer ?? "" : values.defaultEngineer,
          parts: rootLinks.parts,
          subAssemblies: rootLinks.subAssemblies,
          avatarID: replaceFile(rootBomDB?.avatarID, rootAvatar, rootToDelete),
          // A failed render leaves no version, so the next publish tries again.
          filesModelVersion: !rootUnchanged && !rootAvatar ? "" : versions.tree ?? "",
          onshapeID: {
            ...rootKey,
            bomID: bomIdOf(rootOnshapeBom, rootKey),
          },
          onshapeURL: onshapeUrlOf(rootKey),
        });
        await deleteReplaced(rootToDelete);
        rootTrack.finish();

        setRootBomDB(savedRoot);
        setRootIsPublished(true);
        restartChangeWatch(); // the publish wrote the edits to Onshape: not someone else's change
        clearHistory(); // what's published can't be undone here
        currentTreeRef.current = { ...currentTreeRef.current, rootBomDB: savedRoot };
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
        notifyPublishEnded(
          startedAt,
          `"${values.name}" was published`,
          problems.length > 0
            ? `${problems.length} item${problems.length === 1 ? "" : "s"} could not be fully saved; see the panel.`
            : "Everything was saved to the database."
        );
        setPublishOpen(false);
        return true;
      } catch (err: unknown) {
        // Per-item failures are caught inside; this is the top assembly's own
        // steps, so say which step it was on.
        const at = Array.from(active.values()).find((a) => a.name === values.name);
        const message =
          `Publish failed${at ? ` while ${lowerFirst(at.step)}` : ""}: ${describePublishError(err)}`;
        console.warn("[publish] failed:", err);
        setPublishError(message);
        client.showMessageBubble(message);
        notifyPublishEnded(startedAt, `Publish BOM of "${values.name}" failed`, message);
        return null; // marks the operation failed on /tele
      } finally {
        setPublishing(false);
        setPublishProgress(null);
      }
    }),
    [rootKey, client, context.server, restartChangeWatch, clearHistory]
  );

  /**
   * Every saved part and assembly, read once each time the Publish dialog
   * opens: catalog numbers already used outside this tree. A failure is shown
   * as a note and doesn't hold Publish up.
   */
  const [savedRecords, setSavedRecords] = useState<{ parts: PartModel[]; boms: BomModel[] } | "failed" | null>(null);
  useEffect(() => {
    if (!publishOpen) return;
    let cancelled = false;
    getAllRecords().then(
      (records) => !cancelled && setSavedRecords(records),
      () => !cancelled && setSavedRecords("failed")
    );
    return () => {
      cancelled = true;
    };
  }, [publishOpen]);

  /** What the Publish dialog asks about: catalog numbers shared in this tree, and ones already used in the database. */
  const publishChecks = useMemo((): PublishCheck[] => {
    if (!publishOpen) return [];
    const checks: PublishCheck[] = [];
    for (const g of sameNumberGroups) {
      const names = quotedList([...new Set(g.items.map((i) => String(i.name ?? "").trim()))]);
      if (g.kind === "copies") {
        checks.push({ kind: "combine", text: `${g.catalogNumber}: the ${g.items.length} parts named ${names} will be combined into one part.` });
      } else if (g.combinable) {
        const kept = pickRecordRow(g.items.flatMap(membersOf)).name;
        checks.push({ kind: "combine", text: `${g.catalogNumber} is used by ${names}, with different names. Unless you fix it in Onshape first, they will be combined into one part named "${kept}".` });
      } else {
        checks.push({ kind: "warning", text: `${g.catalogNumber} is used by ${names}, including an assembly. Fix it in Onshape; they will be published as they are.` });
      }
    }
    if (savedRecords === "failed") {
      checks.push({ kind: "note", text: "Couldn't check the database for catalog numbers already in use; publishing without that check." });
    } else if (savedRecords) {
      // Catalog numbers of this tree, and the records that are this tree's own.
      const numbersHere = new Map<string, string>();
      for (const r of rows) if (isGrouped(r)) numbersHere.set(catalogKey(r), String(r.catalogNumber ?? "").trim());
      const ownIds = new Set(rows.flatMap((r) => membersOf(r).map((m) => m.id)));
      if (rootBomDB?.id) ownIds.add(rootBomDB.id);
      const usedBy = new Map<string, string[]>();
      const records = [...savedRecords.parts, ...savedRecords.boms] as Array<PartModel & { markedStandard?: boolean }>;
      for (const rec of records) {
        if (!rec?.id || ownIds.has(rec.id) || rec.isStandardContent || rec.markedStandard) continue;
        const key = normalizeCatalogNumber(rec.catalogNumber);
        if (!numbersHere.has(key)) continue;
        const name = String(rec.name ?? rec.id).trim();
        const names = usedBy.get(key) ?? [];
        if (!names.includes(name)) names.push(name);
        usedBy.set(key, names);
      }
      for (const [key, names] of usedBy) {
        checks.push({ kind: "warning", text: `${numbersHere.get(key)} is already used in the database by ${quotedList(names)}, outside this assembly.` });
      }
    }
    return checks;
  }, [publishOpen, sameNumberGroups, savedRecords, rows, rootBomDB]);

  /** Publish from the dialog: the parts it said it would combine are combined first, then everything is published. */
  const handlePublishWithChecks = useCallback(
    (values: PublishBomFormValues) => {
      const keys = sameNumberGroups.filter((g) => g.combinable).map((g) => g.key);
      if (keys.length > 0) {
        const combined = combineSameNumber(currentTreeRef.current.rows, new Set(keys), retrackRow);
        currentTreeRef.current = { ...currentTreeRef.current, rows: combined };
        saveRows(combined);
      }
      return handlePublish(values);
    },
    [sameNumberGroups, saveRows, handlePublish]
  );

  /**
   * Refresh BOM: reload everything from Onshape (database only for fields
   * Onshape lacks). Saves nothing, and discards edits not published yet -
   * after asking, when there are any.
   */
  const [discardEdits, setDiscardEdits] = useState<string[] | null>(null);
  const handleRefresh = useCallback(() => {
    const editedItems = currentTreeRef.current.rows.filter((r) => changedFields(r, r.loaded).length > 0);
    // Asked in a panel dialog: window.confirm may not show in Firefox's sidebar.
    if (editedItems.length > 0) setDiscardEdits(editedItems.map((r) => r.name));
    else loadTree();
  }, [loadTree]);
  const cancelDiscard = useCallback(() => setDiscardEdits(null), []);

  const busy = loading || publishing || subtreeLoads > 0;
  /** Opens the Publish dialog (the header button and Ctrl+Enter). */
  const openPublish = useCallback(() => {
    checkServer(); // shown in the header while the dialog is open
    setPublishError(null);
    setSavedRecords(null); // checked again for this dialog
    setPublishOpen(true);
  }, [checkServer]);

  const [showShortcuts, setShowShortcuts] = useState(false);
  const closeShortcuts = useCallback(() => setShowShortcuts(false), []);
  /** Keyboard shortcuts (shortcuts.ts). Dialogs handle their own keys while open. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (publishOpen || discardEdits || showShortcuts || confirmRevertAll) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.altKey && e.key.toLowerCase() === "f") {
        const search = document.getElementById(SEARCH_INPUT_ID) as HTMLInputElement | null;
        if (!search) return;
        e.preventDefault();
        search.focus();
        search.select();
      } else if (e.altKey && !ctrl && (e.code === "KeyR" || e.key.toLowerCase() === "r")) {
        e.preventDefault();
        if (!busy) handleRefresh();
      } else if (ctrl && e.key === "Enter") {
        e.preventDefault();
        if (!busy && rows.length > 0) openPublish();
      } else if (ctrl && !e.altKey && !isTyping(e.target) && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
        // In a cell's text box the browser's own undo applies instead.
        e.preventDefault();
        if (busy) return;
        if (e.key.toLowerCase() === "y" || e.shiftKey) history.redo();
        else history.undo();
      } else if (e.key === "?" && !ctrl && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        setShowShortcuts(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [publishOpen, discardEdits, showShortcuts, confirmRevertAll, busy, rows.length, handleRefresh, openPublish, history]);

  if (!rootKey) {
    return (
      <div className="p-8 text-center text-zinc-400">
        Waiting for Onshape to provide document context...
      </div>
    );
  }

  // Onshape first; the database only for what Onshape doesn't have.
  const displayName = assemblyNameOf(rootOnshapeBom) || rootBomDB?.name || "Assembly";
  const pendingEditCount = rows.reduce((n, r) => n + (r.modified?.length ?? 0), 0);

  return (
    <div className="assembly-bom-page table-theme-vars p-8 flex gap-6">
      <div className="flex-1">
        <BomHeader
          displayName={displayName}
          description={rootOnshapeBom?.description || rootBomDB?.description}
          rootIsPublished={rootIsPublished}
          websiteUrl={rootBomDB?.id ? bomPageUrl(rootBomDB.id) : null}
          loadedAt={loading ? null : loadedAt}
          onshapeChanged={onshapeChanged && !loading}
          serverStatus={serverStatus}
          onCheckServer={checkServer}
          topProblem={topProblem}
          topNumber={topAssembly.number}
          theme={theme}
          busy={busy}
          loading={loading}
          publishing={publishing}
          hasRows={rows.length > 0}
          pendingEditCount={pendingEditCount}
          onRefresh={handleRefresh}
          onPublish={openPublish}
          onShowShortcuts={() => setShowShortcuts(true)}
        />
        {showShortcuts && <ShortcutsHelp onClose={closeShortcuts} />}
        {elsewhereBom && (
          <PublishedElsewhereCover
            bom={elsewhereBom}
            publishedUrl={elsewhereUrl}
            onOpen={() => openExternal(elsewhereUrl)}
          />
        )}

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
                <ProgressBar
                  done={loadProgress.done}
                  total={loadProgress.total}
                  trackClassName="mt-3 h-1.5 w-full max-w-xs mx-auto rounded-full bg-zinc-800 overflow-hidden"
                />
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
              {loadProgress && loadProgress.total > 0 && <ProgressBar done={loadProgress.done} total={loadProgress.total} />}
            </div>
          )}
          {publishing && publishProgress && !publishOpen && (
            <div className="assembly-bom-refreshing mb-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">
                  Publishing to the database
                  {publishProgress.active.length > 1 ? ` - ${publishProgress.active.length} items at once` : ""}
                  {timeLeftSuffix(publishProgress.secondsLeft)}
                </span>
                <span className="shrink-0">
                  {publishProgress.failed > 0 && (
                    <span className="text-amber-400 mr-2">{publishProgress.failed} problems</span>
                  )}
                  {publishProgress.done} / {publishProgress.total}
                </span>
              </div>
              <ProgressBar done={publishProgress.done} total={publishProgress.total} />
              {publishProgress.active.map((item, i) => (
                <div key={i} className="mt-1 truncate text-zinc-500">
                  {item.name}: {item.step}
                </div>
              ))}
            </div>
          )}
          {!loading && !publishing && cachedAt !== null && (
            <div
              className="assembly-bom-saved-copy mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400"
              role="status"
            >
              <strong>Saved copy from {describeAge(cachedAt)}.</strong> Onshape may have changed since. Press Refresh BOM to
              reload it (needed before publishing).
            </div>
          )}
          <SameNumberNotice groups={sameNumberGroups} onCombine={combineGroups} />
          <BomToolbar
            search={search}
            setSearch={setSearch}
            searching={!!searchFilter}
            searchMatchCount={searchMatchCount}
            problemCount={problemCount}
            problemsOnly={problemsOnly}
            onToggleProblemsOnly={() => setProblemsOnly((v) => !v)}
            hasRows={rows.length > 0}
            subtreeLoads={subtreeLoads}
            setAllExpanded={setAllExpanded}
            hideStandardParts={hideStandardParts}
            setHideStandardParts={setHideStandardParts}
            standardPartCount={standardPartCount}
            hideStandardAssemblies={hideStandardAssemblies}
            setHideStandardAssemblies={setHideStandardAssemblies}
            standardAssemblyCount={standardAssemblyCount}
            showSize={showSize}
            setShowSize={setShowSize}
            canUndo={history.canUndo && !busy}
            canRedo={history.canRedo && !busy}
            onUndo={history.undo}
            onRedo={history.redo}
            editedItemCount={busy ? 0 : editedItemCount}
            onRevertAll={onRevertAll}
          />
          {selectedRows.length > 1 && (
            <SelectionEditBar
              rowCount={selectedRows.length}
              editableCount={selectedEditable.length}
              disabled={busy}
              onSet={setOnSelected}
            />
          )}
          <div onContextMenuCapture={onTableContextMenu}>
          <Table
            data={rows}
            columnsData={columns}
            setData={(newData) => handleTableEdit(newData as AssemblyBomRow[])}
            newRowFunction={undefined}
            initialSort={{ key: "catalogNumber", direction: "asc" }}
            // Like Excel's freeze panes: header row + avatar and name stay visible.
            stickyHeader
            frozenColumns={2}
            rowFilter={searchFilter}
            hideRow={hideRow}
            // Excel-style: select cells, Ctrl+C / Ctrl+V / Ctrl+D, and the bar above for several rows.
            cellSelection
            onSelectionChange={setSelectedRows}
          />
          </div>
          {rowMenu && (
            <RowMenu
              x={rowMenu.x}
              y={rowMenu.y}
              problem={rowMenuProblem}
              fix={rowMenuFix}
              canEdit={!busy}
              inDatabase={rowMenu.row.source === "db"}
              onApplyFix={applyRowMenuFix}
              onOpenWebsite={() =>
                openExternal(rowMenu.row.isAssembly ? bomPageUrl(rowMenu.row.id) : partPageUrl(rowMenu.row.id))
              }
              onCopyOnshapeLink={() =>
                copyText(rowMenu.row.onshapeURL || buildOnshapeElementURL(context.server, keyOf(rowMenu.row)), "Onshape link")
              }
              onClose={closeRowMenu}
            />
          )}
          </>
        )}

        {publishOpen && (
          <PublishBomModal
            open
            mode={rootIsPublished ? "update" : "publish"}
            initialValues={{
              // Onshape first; the database for what Onshape doesn't have.
              name: displayName,
              catalogNumber: topAssembly.number,
              description: rootOnshapeBom?.description || rootBomDB?.description || "",
              comments: rootBomDB?.comments || "",
              defaultEngineer: onshapeUserName,
            }}
            onCancel={() => (publishing ? undefined : setPublishOpen(false))}
            onSubmit={handlePublishWithChecks}
            submitting={publishing}
            progress={publishProgress}
            preview={publishPreview}
            checks={publishChecks}
            checking={savedRecords === null}
            error={publishError}
            changes={publishChanges}
            // A saved copy may be days old: Onshape can have changed since, so
            // it must be refreshed before it is published.
            blockedReason={
              cachedAt === null
                ? null
                : `This is a saved copy from ${describeAge(cachedAt)}. Onshape may have changed since then, so it can't be published. ` +
                  `Close this dialog and press Refresh BOM first.` +
                  (pendingEditCount > 0 ? ` Your unpublished edits in this copy will be lost on Refresh.` : "")
            }
          />
        )}

        {confirmRevertAll && (
          <ConfirmModal
            title="Revert all edits?"
            message={
              <p>
                Every edited cell of {editedItemCount} items goes back to its saved value (or, for items not saved
                yet, to what was loaded). You can undo this with {SHORTCUTS.undo}.
              </p>
            }
            confirmLabel="Revert all"
            onCancel={() => setConfirmRevertAll(false)}
            onConfirm={() => {
              setConfirmRevertAll(false);
              revertRows(null);
            }}
          />
        )}

        {discardEdits && (
          <ConfirmModal
            title="Discard unpublished edits?"
            message={
              <>
                <p>
                  Refresh BOM will discard your unpublished edits to {discardEdits.length} item
                  {discardEdits.length === 1 ? "" : "s"}. They will be lost:
                </p>
                <ul className="mt-2 list-disc pl-5 text-sm text-zinc-300">
                  {discardEdits.slice(0, 5).map((name, i) => (
                    <li key={i} className="truncate">{name}</li>
                  ))}
                  {discardEdits.length > 5 && <li>…and {discardEdits.length - 5} more</li>}
                </ul>
                {/* A saved copy can't be published (it must be refreshed first), so its edits can't be kept. */}
                {cachedAt === null && <p>Publish BOM first to keep them.</p>}
              </>
            }
            confirmLabel="Discard and refresh"
            onCancel={cancelDiscard}
            onConfirm={() => {
              setDiscardEdits(null);
              loadTree();
            }}
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