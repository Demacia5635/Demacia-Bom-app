import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Table from "../components/Table";
import { fetchFromApi, type ApiError } from "../util/ApiService";
import type { BomModel, PartModel } from "../util/Models";
import { useOnshapeClient, useOnshapeContext } from "../util/OnshapeExtension";
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
  postToApi,
  getOnshapeThumbnailSrc
} from "./BomApi";
import type AssemblyBomRow from "./AssemblyBomRow";
import { parseOnshapeBomTable, type OnshapeBomTable, type ParsedOnshapeBomRow } from "./OnshapeBom";
import buildAssemblyBomColumns from "./AssemblyBomColumns";
import PublishBomModal, { type PublishBomFormValues, type PublishProgress } from "./PublishBomModel";
import { describeAge, readTreeCache, treeCacheKey, writeTreeCache } from "./treeCache";

function resolveWvm(context: Pick<ReturnType<typeof useOnshapeContext>, "workspaceId" | "versionId">): { wvmType: string; wvmID: string } | null {
  if (context.workspaceId) return { wvmType: "w", wvmID: context.workspaceId };
  if (context.versionId) return { wvmType: "v", wvmID: context.versionId };
  return null;
}

function buildOnshapeElementURL(server: string | null, key: OnshapeKey): string {
  const base = server || "https://cad.onshape.com";
  return `${base}/documents/${key.documentID}/${key.wvmType}/${key.wvmID}/e/${key.elementID}`;
}

/** "thumbnail, STL and Parasolid" from the kinds of files being exported. */
function describeFileKinds(kinds: readonly ("thumbnail" | "stl" | "parasolid")[]): string {
  const labels = kinds.map((k) => (k === "stl" ? "STL" : k === "parasolid" ? "Parasolid" : "thumbnail"));
  return labels.length <= 1 ? labels.join("") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** Placeholder name the server gives a part saved without one. */
const UNNAMED_PART = "Unnamed Part";

/** Loads a parent assembly's DB record (null when missing); memoized per tree load. */
type ParentBomLoader = (bomRowId: string) => Promise<BomModel | null>;

interface ResolvedNode {
  row: AssemblyBomRow;
  key?: OnshapeKey;
  bomID?: string;
  onshapeBom?: OnshapeBomTable;
}

export default function AssemblyBomPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const context = useOnshapeContext();
  const client = useOnshapeClient({ context });

  const [rows, setRows] = useState<AssemblyBomRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [isVerifyingApi, setIsVerifyingApi] = useState<boolean>(true);
  const [rootBomDB, setRootBomDB] = useState<BomModel | null>(null);
  const [rootIsPublished, setRootIsPublished] = useState<boolean>(false);
  const [rootOnshapeBom, setRootOnshapeBom] = useState<OnshapeBomTable | null>(null);
  const [currentUser, setCurrentUser] = useState<string>("");

  /** Tree-loading progress; null until the root BOM has been read. */
  const [loadProgress, setLoadProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  /** When the rows on screen come from the saved copy: when it was saved. */
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  /** The saved copy is only shown on the first load; later reloads keep the current rows. */
  const triedCacheRef = useRef(false);

  const [publishOpen, setPublishOpen] = useState(false);
  /** Progress of a running Publish / Update BOM; null when idle. */
  const [publishProgress, setPublishProgress] = useState<PublishProgress | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const fetchWithUserKeys = useCallback(async (url: string, options: RequestInit = {}) => {
    const username = localStorage.getItem("username") || "";
    const headers = {
      ...options.headers,
      "x-username": username,
    };
    return fetchFromApi(url, { ...options, headers });
  }, []);

  // 1. Test sending an API request on mount. If out of requests or unauthenticated, redirect to signin.
  useEffect(() => {
    let isMounted = true;
    const username = localStorage.getItem("username");
    
    if (!username) {
      // Pass the Onshape URL search context to the sign-in page
      navigate(`/signin${location.search}`, { replace: true });
      return;
    }

    setCurrentUser(username);

    postToApi(`/auth/verify-requests`, { username })
      .then(() => {
        if (!isMounted) return;
        setIsVerifyingApi(false);
      })
      .catch((err: any) => {
        if (!isMounted) return;
        // The server has no /auth/verify-requests route yet; a 404 means the
        // check isn't available, not that the user is signed out.
        if (err?.statusCode === 404) {
          setIsVerifyingApi(false);
          return;
        }
        if (err?.statusCode === 401 || err?.statusCode === 403 || err?.statusCode === 429) {
          navigate(`/signin${location.search}`, { replace: true });
        } else {
          navigate(`/signin${location.search}`, { replace: true });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [navigate, location.search]);

  const handleSignOut = () => {
    localStorage.removeItem("username");
    navigate(`/signin${location.search}`, { replace: true });
  };

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
      getParentBom: ParentBomLoader
    ): Promise<{ node: ResolvedNode; dbBom: BomModel | null }> => {
      const onshapeBom = await getOnshapeBom(key);
      const bomID = onshapeBom.id || key.elementID;

      let dbBom: BomModel | null = null;
      try {
        dbBom = await getBomByOnshapeKey(key, bomID);
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

      const row: AssemblyBomRow = {
        id: rowId,
        parentId: parentRowId,
        isExpanded: true,
        source: isPublished ? "db" : "onshape-only",
        isAssembly: true,
        avatar: dbBom?.avatarID ? `/drive/file/id/${dbBom.avatarID}` : getOnshapeThumbnailSrc(key),
        name: dbBom?.name || onshapeBom.name.slice(6) || key.elementID,
        catalogNumber: dbBom?.catalogNumber || "",
        revision: "-",
        description: dbBom?.description || onshapeBom.description || "",
        engineer: dbBom?.engineer || "",
        material: "-",
        mass: 0,
        price: 0,
        quantity: 1,
        comments: dbBom?.comments || "",
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

      return { node: { row, key, bomID, onshapeBom }, dbBom };
    },
    [context.server, fetchWithUserKeys]
  );

  const resolvePartRow = useCallback(
    async (
      parsedItem: ParsedOnshapeBomRow,
      parentRowId: string | null,
      rootBom: BomModel | null,
      getParentBom: ParentBomLoader
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
        dbPart = await getPartByOnshapeKey(key, partID);
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
      // A saved name of "Unnamed Part" is a placeholder the server filled in;
      // show Onshape's name and let Update BOM save it.
      const savedNameIsPlaceholder = dbPart?.name === UNNAMED_PART && !!parsedItem.name;

      return {
        id: rowId,
        parentId: parentRowId,
        isExpanded: false,
        source: isPublished ? "db" : "onshape-only",
        isAssembly: false,
        avatar: dbPart?.avatarID ? `/drive/file/id/${dbPart.avatarID}` : getOnshapeThumbnailSrc(key, partID, parsedItem.itemSource),
        name: (savedNameIsPlaceholder ? parsedItem.name : dbPart?.name) || parsedItem.name || partID,
        repairName: savedNameIsPlaceholder ? parsedItem.name : undefined,
        catalogNumber: dbPart?.catalogNumber || parsedItem.partNumber || "",
        revision: dbPart?.revision || parsedItem.revision || "",
        description: dbPart?.description || parsedItem.description || "",
        engineer: dbPart?.engineer || "",
        material: dbPart?.material || parsedItem.material || "",
        mass: dbPart?.mass || 0,
        price: dbPart?.price || 0,
        quantity: parsedItem.quantity || 1,
        comments: dbPart?.comments || "",
        documentID: key.documentID,
        wvmType: key.wvmType,
        wvmID: key.wvmID,
        elementID: key.elementID,
        entityID: partID,
        onshapeURL: dbPart?.onshapeURL || onshapeUrl,
        exportSTL: dbPart?.stlLink || "",
        exportParasolid: dbPart?.parasolidLink || "",
        dbAction: isExist ? "" : "add",
        vendor: dbPart?.vendor || parsedItem.vendor || "",
        configuration: parsedItem.itemSource.configuration || "",
      };
    },
    [context.server, fetchWithUserKeys]
  );

  const loadTree = useCallback(async () => {
    if (!rootKey) return;

    setLoading(true);
    setError(null);
    setLoadProgress(null);

    // First load: show the saved copy (if any) while the fresh tree loads.
    const cacheKey = treeCacheKey(rootKey);
    if (!triedCacheRef.current) {
      triedCacheRef.current = true;
      const cached = readTreeCache(cacheKey);
      if (cached) {
        setRows(cached.rows);
        setRootBomDB(cached.rootBomDB);
        setRootIsPublished(Boolean(cached.rootBomDB));
        setRootOnshapeBom(
          cached.rootBom ? ({ ...cached.rootBom, headers: [], items: [] } as OnshapeBomTable) : null
        );
        setCachedAt(cached.savedAt);
      }
    }

    // Each parent assembly's DB record is fetched once per load, not once per child row.
    const parentBomRequests = new Map<string, Promise<BomModel | null>>();
    const getParentBom: ParentBomLoader = (bomRowId) => {
      let request = parentBomRequests.get(bomRowId);
      if (!request) {
        request = (fetchWithUserKeys(`/db/bom/id/${encodeURIComponent(bomRowId)}`) as Promise<BomModel>).catch(
          () => null
        );
        parentBomRequests.set(bomRowId, request);
      }
      return request;
    };

    const visitedBomIds = new Set<string>();
    const allRows: AssemblyBomRow[] = [];

    try {
      const { node: rootNode, dbBom } = await resolveBomNode(rootKey, null, 'root', getParentBom);
      setRootBomDB(dbBom);
      setRootIsPublished(Boolean(dbBom));
      setRootOnshapeBom(rootNode.onshapeBom ?? null);
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

            const { node: subNode } = await resolveBomNode(subKey, childParentId, dbBom, getParentBom);
            allRows.push(subNode.row);
            await expand(subNode, false);
          } else {
            const partRow = await resolvePartRow(item, childParentId, dbBom, getParentBom);
            allRows.push(partRow);
          }
        }
      }

      await expand(rootNode, true);
      setRows(allRows);
      setCachedAt(null);
      writeTreeCache(cacheKey, {
        rows: allRows,
        rootBomDB: dbBom,
        rootBom: rootNode.onshapeBom ? { id: rootNode.onshapeBom.id, name: rootNode.onshapeBom.name } : null,
      });
    } catch (err: any) {
      if (err?.statusCode === 401 || err?.statusCode === 403 || err?.statusCode === 429) {
        navigate(`/signin${location.search}`, { replace: true });
        return;
      }
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  }, [rootKey, resolveBomNode, resolvePartRow, fetchWithUserKeys, navigate, location.search]);

  useEffect(() => {
    if (!isVerifyingApi && rootKey) {
      loadTree();
    }
  }, [isVerifyingApi, rootKey, loadTree]);

  const columns = useMemo(
    () =>
      buildAssemblyBomColumns({
        rootIsPublished,
        onAddToDb: (row) => {
          if (loading) {
            client.showMessageBubble("Wait until the assembly tree has finished refreshing.");
            return;
          }
          if (!rootIsPublished) {
            client.showMessageBubble(
              `Publish the top-level assembly to save "${row.name}" and everything else to the database.`
            );
            return;
          }
          return handlePublishItem(row);
        },
      }),
    [client, rootIsPublished, loading]
  );

  const handlePublishItem = useCallback(
    async (row: AssemblyBomRow) => {
      const key: OnshapeKey = {
        documentID: row.documentID,
        wvmType: row.wvmType,
        wvmID: row.wvmID,
        elementID: row.elementID,
      };

      if (!rootBomDB || !rootKey) return;

      try {
        if (row.isAssembly) {
          const children = rows.filter((r) => r.parentId === row.id);
          const parts = children
            .filter((c) => !c.isAssembly)
            .map((c) => ({ partID: c.id, quantity: c.quantity || 1 }));
          const subAssemblies = children
            .filter((c) => c.isAssembly)
            .map((c) => ({ bomID: c.id, quantity: c.quantity || 1 }));

          const bomAvatarId = await syncBomThumbnailToDrive(key, row.name);

          await upsertBomById(row.id, {
            id: row.id,
            name: row.name,
            description: row.description,
            catalogNumber: row.catalogNumber,
            comments: row.comments,
            engineer: row.vendor === "" ? row.engineer : row.vendor,
            parts: parts,
            subAssemblies: subAssemblies,
            onshapeURL: `https://cad.onshape.com/documents/${key.documentID}/${key.wvmType}/${key.wvmID}/e/${key.elementID}`,
            avatarID: bomAvatarId || "",
            onshapeID: {
              ...key,
              bomID: row.entityID,
            },
            vendor: row.vendor,
          });
        } else {
          const { avatarID, stlLink, parasolidLink, failures } = await syncPartFilesToDrive(
            key,
            row.entityID,
            row.name,
            { configuration: row.configuration }
          );
          if (failures.length > 0) {
            client.showMessageBubble(`Some files could not be saved: ${failures.join("; ")}`);
          }

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
            engineer: row.vendor === "" ? row.engineer : row.vendor,
            ...(avatarID ? { avatarID } : {}),
            ...(stlLink ? { stlLink } : {}),
            ...(parasolidLink ? { parasolidLink } : {}),
            onshapeURL: `https://cad.onshape.com/documents/${key.documentID}/${key.wvmType}/${key.wvmID}/e/${key.elementID}`,
            onshapeID: {
              ...key,
              partID: row.entityID,
            },
            vendor: row.vendor,
          });
        }

        if (row.parentId !== null) {
          if (row.isAssembly) {
            const children = await fetchWithUserKeys(`/db/bom/id/${row.parentId}`) as BomModel;
            if (children.subAssemblies.length === 0) return;
            await upsertBomById(row.parentId, {
              subAssemblies: [...children.subAssemblies, { bomID: row.id, quantity: row.quantity || 1 }]
            });
          } else {
            const children = await fetchWithUserKeys(`/db/bom/id/${row.parentId}`) as BomModel;
            if (children.parts.length === 0) return;
            await upsertBomById(row.parentId, {
              parts: [...children.parts, { partID: row.id, quantity: row.quantity || 1 }]
            });
          }
        } else {
          const rootID = rootBomDB?.id || `${rootKey.documentID}_${rootKey.wvmType}_${rootKey.wvmID}_${rootKey.elementID}_${rootOnshapeBom?.id}` || "wrong id";
          if (row.isAssembly) {
            const children = await fetchWithUserKeys(`/db/bom/id/${rootID}`) as BomModel;
            if (children.subAssemblies.length === 0) return;
            await upsertBomById(rootID, {
              subAssemblies: [...children.subAssemblies, { bomID: row.id, quantity: row.quantity || 1 }]
            });
          } else {
            const children = await fetchWithUserKeys(`/db/bom/id/${rootID}`) as BomModel;
            if (children.parts.length === 0) return;
            await upsertBomById(rootID, {
              parts: [...children.parts, { partID: row.id, quantity: row.quantity || 1 }]
            });
          }
        }

        client.showMessageBubble(`"${row.name}" was published to the database.`);
        await loadTree();
      } catch (err: any) {
        if (err?.statusCode === 401 || err?.statusCode === 403 || err?.statusCode === 429) {
          navigate(`/signin${location.search}`, { replace: true });
          return;
        }
        const apiErr = err as ApiError;
        client.showMessageBubble(`Publish failed: ${apiErr.message}`);
      }
    },
    [rows, client, loadTree, rootBomDB, rootKey, rootOnshapeBom?.id, fetchWithUserKeys, navigate, location.search]
  );

  const handleTableEdit = useCallback(
    (newData: AssemblyBomRow[]) => {
      const previousById = new Map(rows.map((r) => [r.id, r]));
      const changed = newData.find((r) => {
        const prev = previousById.get(r.id);
        if (!prev) return false;
        return (Object.keys(r) as (keyof AssemblyBomRow)[]).some((k) => r[k] !== prev[k]);
      });

      if (!changed) return;
      if (changed.vendor !== "") return;
      if (loading) {
        // The rows may be the saved copy; editing them could save stale data.
        client.showMessageBubble("Wait until the assembly tree has finished refreshing, then edit again.");
        return;
      }

      setRows(newData);

      if (!rootIsPublished) {
        const key: OnshapeKey = {
          documentID: changed.documentID,
          wvmType: changed.wvmType,
          wvmID: changed.wvmID,
          elementID: changed.elementID,
        };

        const persistToOnshape = async () => {
          try {
            if (changed.isAssembly) {
              await updateOnshapeBomMetadata(key, {
                name: changed.name,
                description: changed.description,
                partNumber: changed.catalogNumber,
              });
            } else {
              await updateOnshapePartMetadata(key, changed.entityID, {
                name: changed.name,
                description: changed.description,
                catalogNumber: changed.catalogNumber,
                revision: changed.revision,
                engineer: changed.engineer,
                price: changed.price,
                comments: changed.comments,
              });
            }
            client.showMessageBubble(`"${changed.name}" was updated in the database.`);
          } catch (err: any) {
            if (err?.statusCode === 401 || err?.statusCode === 403 || err?.statusCode === 429) {
              navigate(`/signin${location.search}`, { replace: true });
              return;
            }
            const apiErr = err as ApiError;
            client.showMessageBubble(`Failed to save "${changed.name}": ${apiErr.message}`);
            setError(apiErr);
          }
        };

        persistToOnshape();
        return;
      }

      if (changed.source !== "db") return;

      const key: OnshapeKey = {
        documentID: changed.documentID,
        wvmType: changed.wvmType,
        wvmID: changed.wvmID,
        elementID: changed.elementID,
      };

      const persist = async () => {
        try {
          if (changed.isAssembly) {
            await upsertBomById(changed.id, {
              name: changed.name,
              description: changed.description,
              catalogNumber: changed.catalogNumber,
              engineer: changed.engineer,
              comments: changed.comments,
            });
          } else {
            await upsertPartById(changed.id, {
              name: changed.name,
              description: changed.description,
              catalogNumber: changed.catalogNumber,
              revision: changed.revision,
              engineer: changed.engineer,
              material: changed.material,
              mass: changed.mass,
              price: changed.price,
              comments: changed.comments,
            });
            try {
              await updateOnshapePartMetadata(key, changed.entityID, {
                name: changed.name,
                description: changed.description,
                catalogNumber: changed.catalogNumber,
                revision: changed.revision,
                engineer: changed.engineer,
                price: changed.price,
                comments: changed.comments
              });
            } catch {
              // Onshape metadata push is best-effort only.
            }
          }
          client.showMessageBubble(`"${changed.name}" was updated in the database.`);
        } catch (err: any) {
          if (err?.statusCode === 401 || err?.statusCode === 403 || err?.statusCode === 429) {
            navigate(`/signin${location.search}`, { replace: true });
            return;
          }
          const apiErr = err as ApiError;
          client.showMessageBubble(`Failed to save "${changed.name}": ${apiErr.message}`);
          setError(apiErr);
        }
      };

      persist();
    },
    [rows, client, rootIsPublished, loading, navigate, location.search]
  );

  const handlePublish = useCallback(
    async (values: PublishBomFormValues) => {
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

      // Progress: the top assembly, each sub-assembly and each distinct part is one item.
      const total = 1 + rows.filter((r) => r.isAssembly).length + new Set(rows.filter((r) => !r.isAssembly).map((r) => r.id)).size;
      let started = 0;
      let failedCount = 0;
      const report = (current: string, step: string) =>
        setPublishProgress({ itemNumber: started, total, current, step, failed: failedCount });
      const startItem = (current: string, step: string) => {
        started += 1;
        report(current, step);
      };

      try {
        const isUpdate = Boolean(rootBomDB);
        startItem(values.name, isUpdate ? "Updating the assembly" : "Saving the assembly");
        const rootLinks = buildLinkArrays(rootRowId);
        // On an update, keep the saved thumbnail instead of uploading a new copy to Drive.
        const rootBomAvatarID = rootBomDB?.avatarID || (await syncBomThumbnailToDrive(rootKey, values.name));
        await upsertBomById(rootID, {
          id: rootID,
          name: values.name,
          description: values.description,
          comments: values.comments,
          catalogNumber: values.catalogNumber,
          engineer: rootBomDB?.engineer || values.defaultEngineer,
          parts: rootLinks.parts,
          subAssemblies: rootLinks.subAssemblies,
          avatarID: rootBomAvatarID || "",
          onshapeID: {
            ...rootKey,
            bomID: rootOnshapeBom.id
          },
          onshapeURL: `https://cad.onshape.com/documents/${rootKey.documentID}/${rootKey.wvmType}/${rootKey.wvmID}/e/${rootKey.elementID}`,
        });

        // Export problems don't stop the publish; they're reported at the end.
        const fileFailures: string[] = [];
        // A part used in several places is exported once.
        const handledPartIds = new Set<string>();

        for (const row of rows) {
          const key: OnshapeKey = {
            documentID: row.documentID,
            wvmType: row.wvmType,
            wvmID: row.wvmID,
            elementID: row.elementID,
          };

          if (!row.isAssembly) {
            if (handledPartIds.has(row.id)) continue;
            handledPartIds.add(row.id);
          }

          failedCount = fileFailures.length;
          startItem(row.name, row.source === "db" ? "Checking" : "Saving");

          if (row.source === "db") {
            // Already saved: keep its data and files, but make its item lists
            // match the current Onshape structure (items added or removed since).
            // Rows with a saved image show it from Drive; anything else has none saved.
            const hasSavedImage = typeof row.avatar === "string" && row.avatar.startsWith("/drive/file/id/");
            if (row.isAssembly) {
              const links = buildLinkArrays(row.id);
              const patch: Partial<BomModel> = { parts: links.parts, subAssemblies: links.subAssemblies };
              if (!hasSavedImage) {
                report(row.name, "Saving thumbnail");
                const avatarID = await syncBomThumbnailToDrive(key, row.name);
                if (avatarID) patch.avatarID = avatarID;
                else fileFailures.push(`Thumbnail of "${row.name}"`);
              }
              await upsertBomById(row.id, patch);
            } else {
              const patch: Partial<PartModel> = {};
              // Restore a name the server replaced with "Unnamed Part".
              if (row.repairName) patch.name = row.repairName;

              // Saved part without its thumbnail, STL or Parasolid: export just what's missing.
              const missing = [
                ...(!hasSavedImage ? (["thumbnail"] as const) : []),
                ...(!row.exportSTL ? (["stl"] as const) : []),
                ...(!row.exportParasolid ? (["parasolid"] as const) : []),
              ];
              if (missing.length > 0) {
                report(row.name, `Exporting ${describeFileKinds(missing)}`);
                const files = await syncPartFilesToDrive(key, row.entityID, row.name, {
                  configuration: row.configuration,
                  only: missing,
                });
                fileFailures.push(...files.failures);
                if (files.avatarID) patch.avatarID = files.avatarID;
                if (files.stlLink) patch.stlLink = files.stlLink;
                if (files.parasolidLink) patch.parasolidLink = files.parasolidLink;
              }

              if (Object.keys(patch).length > 0) await upsertPartById(row.id, patch);
            }
            continue;
          }

          const engineer = row.engineer || values.defaultEngineer;
          if (row.isAssembly) {
            const links = buildLinkArrays(row.id);
            report(row.name, "Saving with thumbnail");
            const bomAvatarId = await syncBomThumbnailToDrive(key, row.name);
            await upsertBomById(row.id, {
              id: row.id,
              name: row.name,
              description: row.description,
              catalogNumber: row.catalogNumber,
              comments: row.comments,
              engineer: row.vendor === "" ? engineer : row.vendor,
              parts: links.parts,
              subAssemblies: links.subAssemblies,
              onshapeURL: `https://cad.onshape.com/documents/${key.documentID}/${key.wvmType}/${key.wvmID}/e/${key.elementID}`,
              avatarID: bomAvatarId || "",
              onshapeID: {
                ...key,
                bomID: row.entityID,
              },
              vendor: row.vendor
            });
          } else {
            report(row.name, "Exporting thumbnail, STL and Parasolid");
            const { avatarID, stlLink, parasolidLink, failures } = await syncPartFilesToDrive(
              key,
              row.entityID,
              row.name,
              { configuration: row.configuration }
            );
            fileFailures.push(...failures);
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
              engineer: row.vendor === "" ? engineer : row.vendor,
              ...(avatarID ? { avatarID } : {}),
              ...(stlLink ? { stlLink } : {}),
              ...(parasolidLink ? { parasolidLink } : {}),
              onshapeURL: `https://cad.onshape.com/documents/${key.documentID}/${key.wvmType}/${key.wvmID}/e/${key.elementID}`,
              onshapeID: {
                ...key,
                partID: row.entityID,
              },
              vendor: row.vendor
            });
          }
        }

        failedCount = fileFailures.length;
        report("", "Reloading the tree");

        client.showMessageBubble(
          isUpdate
            ? `"${values.name}" was updated in the database.`
            : `"${values.name}" and its contents were published to the database.`
        );
        if (fileFailures.length > 0) {
          console.warn("[publish] files not saved:", fileFailures);
          client.showMessageBubble(
            `${fileFailures.length} file${fileFailures.length === 1 ? "" : "s"} could not be saved to Drive ` +
              `(first: ${fileFailures[0]}). Run Update BOM again to retry the missing ones.`
          );
        }
        setPublishOpen(false);
        await loadTree();
      } catch (err: any) {
        if (err?.statusCode === 401 || err?.statusCode === 403 || err?.statusCode === 429) {
          navigate(`/signin${location.search}`, { replace: true });
          return;
        }
        const apiErr = err as ApiError;
        setPublishError(apiErr.message);
        client.showMessageBubble(`Publish failed: ${apiErr.message}`);
      } finally {
        setPublishing(false);
        setPublishProgress(null);
      }
    },
    [rootKey, rootOnshapeBom, rootBomDB, rows, client, loadTree, navigate, location.search]
  );

  if (isVerifyingApi) {
    return (
      <div className="p-8 text-center text-zinc-400">
        Verifying API access and request limits...
      </div>
    );
  }

  if (!rootKey) {
    return (
      <div className="p-8 text-center text-zinc-400">
        Waiting for Onshape to provide document context...
      </div>
    );
  }

  const displayName = rootBomDB?.name || rootOnshapeBom?.name.slice(6) || "Assembly";

  return (
    <div className="assembly-bom-page p-8 flex gap-6">
      <div className="flex-1">
        <div className="assembly-bom-header flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div>
            <h1 className="assembly-bom-title text-2xl font-bold">{displayName}</h1>
            {rootBomDB?.description && <p className="assembly-bom-subtitle text-zinc-500 text-sm mt-1">{rootBomDB.description}</p>}
            {!rootIsPublished && (
              <p className="assembly-bom-unpublished-hint text-xs text-blue-500 mt-1 italic">
                This assembly isn't in the database yet - it's showing live Onshape data.
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs bg-zinc-100 dark:bg-zinc-800/50 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700/50">
              <span className="text-zinc-600 dark:text-zinc-400">👤 {currentUser}</span>
              <div className="w-px h-3 bg-zinc-300 dark:bg-zinc-600 mx-1"></div>
              <button 
                onClick={handleSignOut} 
                className="text-zinc-600 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 font-semibold transition-colors"
                title="Sign out of Onshape Integration"
              >
                Sign Out
              </button>
            </div>

            <button
              type="button"
              className="publish-btn-primary px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
              onClick={() => setPublishOpen(true)}
              disabled={loading}
              title={rootIsPublished ? "Add new items and refresh the assembly structure in the database" : undefined}
            >
              {rootIsPublished ? "Update BOM" : "Publish to database"}
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
                <span className="truncate">
                  {cachedAt !== null ? `Saved copy from ${describeAge(cachedAt)} - refreshing...` : "Refreshing..."}
                </span>
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
          {!loading && cachedAt !== null && (
            <div className="assembly-bom-refreshing mb-2 text-xs text-amber-400">
              Showing the saved copy from {describeAge(cachedAt)}; refreshing failed.
            </div>
          )}
          <Table
            data={rows}
            columnsData={columns}
            setData={(newData) => handleTableEdit(newData as AssemblyBomRow[])}
            newRowFunction={undefined}
            initialSort={{ key: "catalogNumber", direction: "asc" }}
          />
          </>
        )}

        {publishOpen && (
          <PublishBomModal
            open
            mode={rootIsPublished ? "update" : "publish"}
            initialValues={
              rootBomDB
                ? {
                    name: rootBomDB.name || displayName,
                    catalogNumber: rootBomDB.catalogNumber || "",
                    description: rootBomDB.description || "",
                    comments: rootBomDB.comments || "",
                  }
                : { name: displayName }
            }
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