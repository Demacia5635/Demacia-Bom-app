import { useEffect, useState, useRef, type MouseEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Table from "../../../components/Table";
import { fetchFromApi, AuthenticatedImage, type ApiError } from "../../../util/ApiService";
import type { BomModel, PartModel } from "../../../util/Models";
import type BomTableRow from "./BomTableRow";
import MainBomDataUI from "./MainBomDataUI";
import SubAssemblySummary from "./SubAssemblySummary";
import BomColumns from "./BomColumns";
import PartPortal from "../../../Pages/searchPartsPage/PartPortal";
import { recordImageSrc } from "../../../util/recordImage";
import { fetchBomsByIds, fetchPartsByIds } from "../../../util/records";
import { useThemeSync } from "../../../util/misc/useThemeSync";
import { partDisplayName } from "../../../util/partDisplayName";
import { readShowSize, writeShowSize } from "../../../util/partSize";

/** The table columns without Size, for when "Show size" is off. */
const COLUMNS_WITHOUT_SIZE = BomColumns.filter((c) => c.key !== "size");

/** Part fields the table edits and saves (only the changed ones are sent). */
const SAVED_PART_FIELDS = [
  "name", "catalogNumber", "revision", "description", "engineer",
  "material", "mass", "price", "comments", "vendor",
] as const satisfies readonly (keyof BomTableRow)[];

/**
 * How the BOM's sub-assemblies are shown:
 * - single: one level, each sub-assembly is a row like a part.
 * - structured: each sub-assembly opens (▶) to show its own parts and sub-assemblies.
 * - flattened: structured with every sub-assembly already open.
 */
type BomView = "single" | "structured" | "flattened";

const BOM_VIEWS: { key: BomView; label: string; title: string }[] = [
  { key: "single", label: "Single-level", title: "Sub-assemblies are rows, like parts" },
  { key: "structured", label: "Structured", title: "Open a sub-assembly to see what's inside it" },
  { key: "flattened", label: "Flattened", title: "Every sub-assembly opened" },
];

const VIEW_STORAGE_KEY = "bomDetailsView";

function savedView(): BomView {
  try {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    if (BOM_VIEWS.some((v) => v.key === saved)) return saved as BomView;
  } catch { /* storage blocked: default view */ }
  return "single";
}

/** A BOM with every sub-assembly under it, and all their parts. */
interface BomTree {
  rootId: string;
  root: BomModel;
  boms: Map<string, BomModel>;
  parts: Map<string, PartModel>;
}

/** Loads a BOM's whole tree: one batch request per level of sub-assemblies, then one for the parts. */
async function loadBomTree(rootId: string): Promise<BomTree> {
  const root = await fetchFromApi<BomModel>(`/db/bom/id/${rootId}`);
  const boms = new Map<string, BomModel>();
  const tried = new Set<string>([rootId]);
  let level: BomModel[] = [root];

  while (level.length > 0) {
    const next = [...new Set(level.flatMap((b) => (b.subAssemblies || []).map((s) => s.bomID)))]
      .filter((id) => id && !tried.has(id));
    next.forEach((id) => tried.add(id));
    const found = await fetchBomsByIds(next);
    found.forEach((bom, id) => boms.set(id, bom));
    level = [...found.values()];
  }

  const partIds = [root, ...boms.values()].flatMap((b) => (b.parts || []).map((p) => p.partID));
  const parts = await fetchPartsByIds(partIds);
  return { rootId, root, boms, parts };
}

/**
 * The table rows of `tree` in `view`. Quantities are per parent, as in Onshape's
 * structured BOM. A sub-assembly row's id is its path from the root, so the same
 * sub-assembly used in two places opens and closes on its own; a part's id is
 * its part id, so an edit shows on every row of that part.
 */
function buildBomRows(tree: BomTree, view: BomView): BomTableRow[] {
  const rows: BomTableRow[] = [];

  const addBom = (bom: BomModel, parentRowId: string | null, path: string[]) => {
    for (const sub of bom.subAssemblies || []) {
      const record = tree.boms.get(sub.bomID) ?? null;
      const subPath = [...path, sub.bomID];
      const rowId = `sub-${subPath.join("/")}`;
      rows.push({
        id: rowId,
        parentId: parentRowId,
        isExpanded: view === "flattened",
        isSubAssembly: true,
        subBomId: sub.bomID,
        avatar: recordImageSrc(record as any),
        name: partDisplayName(record, sub.bomID),
        catalogNumber: record?.catalogNumber || "",
        revision: "-",
        description: record?.description || "",
        engineer: record?.engineer || "",
        material: "-",
        mass: 0,
        price: 0,
        quantity: sub.quantity || 1,
        comments: record?.comments || "",
        documentID: record?.onshapeID?.documentID || "",
        wvmType: record?.onshapeID?.wvmType || "w",
        wvmID: record?.onshapeID?.wvmID || "",
        elementID: record?.onshapeID?.elementID || "",
        entityID: record?.onshapeID?.bomID || record?.id || sub.bomID,
        onshapeURL: record?.onshapeURL || "",
        exportSTL: "",
        exportParasolid: "",
        vendor: record?.vendor || "",
        markedStandard: !!record?.markedStandard,
      });
      // `path` guards against a BOM that (wrongly) contains itself.
      if (view !== "single" && record && !path.includes(sub.bomID)) addBom(record, rowId, subPath);
    }

    for (const p of bom.parts || []) {
      // A part missing from the database shows as a plain row with its ID.
      const part = tree.parts.get(p.partID) ?? ({ id: p.partID } as PartModel);
      rows.push({
        id: `part-${p.partID}`,
        parentId: parentRowId,
        isExpanded: false,
        isSubAssembly: false,
        avatar: recordImageSrc(part as any),
        name: partDisplayName(part, p.partID),
        catalogNumber: part.catalogNumber || "",
        revision: part.revision || "",
        description: part.description || "",
        engineer: part.engineer || "",
        material: part.material || "",
        mass: part.mass || 0,
        size: part.size || "",
        price: part.price || 0,
        quantity: p.quantity || 1,
        comments: part.comments || "",
        documentID: part.onshapeID?.documentID || "",
        wvmType: part.onshapeID?.wvmType || "w",
        wvmID: part.onshapeID?.wvmID || "",
        elementID: part.onshapeID?.elementID || "",
        entityID: p.partID,
        onshapeURL: part.onshapeURL || "",
        exportSTL: part.stlLink || "",
        exportParasolid: part.parasolidLink || "",
        vendor: part.vendor || "",
        isStandardContent: !!part.isStandardContent,
        markedStandard: !!part.markedStandard,
      });
    }
  };

  addBom(tree.root, null, [tree.rootId]);
  return rows;
}

export default function BomDetailsPage() {
  const { bomId } = useParams<{ bomId: string }>();
  const navigate = useNavigate();

  // The app's theme toggle (like every other page), not the OS setting.
  const { isLight } = useThemeSync();

  const [rows, setRows] = useState<BomTableRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);
  /** Failed cell saves by part id (each cleared when that part saves). */
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [mainBomData, setMainBomData] = useState<BomModel | null>(null);

  const [selectedPart, setSelectedPart] = useState<PartModel | null>(null);
  const [isPartPortalOpen, setIsPartPortalOpen] = useState<boolean>(false);
  /** "Show Part Data" of a made sub-assembly (only a BOM record): read-only summary. */
  const [selectedSubBom, setSelectedSubBom] = useState<BomModel | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    row: BomTableRow;
  } | null>(null);
  const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null);
  const [tree, setTree] = useState<BomTree | null>(null);
  const [view, setView] = useState<BomView>(savedView);
  /** "Show size" checkbox, shared with the work-order page (remembered in this browser). */
  const [showSize, setShowSize] = useState(readShowSize);
  useEffect(() => writeShowSize(showSize), [showSize]);

  // Ref to hold debounced save timeouts per part ID
  const saveTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Fields changed since that part's last save (an edit restarts the timer, so
  // earlier edits must still go out with the later one).
  const pendingFieldsRef = useRef<Record<string, Partial<BomTableRow>>>({});
  // Edits made on this page, per part: laid over the loaded tree when a view
  // builds its rows, so switching views shows them (the tree itself is state
  // and isn't changed in place).
  const partEditsRef = useRef<Map<string, Partial<PartModel>>>(new Map());

  useEffect(() => {
    if (!bomId) return;
    // Switching BOMs: the previous one's header goes, and its late reply is ignored.
    let cancelled = false;
    setMainBomData(null);

    fetchFromApi<BomModel>(`/db/bom/id/${bomId}`)
      .then((bom) => { if (!cancelled) setMainBomData(bom); })
      .catch(() => { /* the table load below shows the error */ });
    return () => { cancelled = true; };
  }, [bomId]);

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  // The whole assembly tree, loaded once per BOM; each view builds its rows from it.
  useEffect(() => {
    if (!bomId) return;
    let cancelled = false;
    setTree(null);
    partEditsRef.current = new Map();
    setRows([]);
    setError(null);
    setLoading(true);
    loadBomTree(bomId)
      .then((loaded) => { if (!cancelled) setTree(loaded); })
      .catch((err: ApiError) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bomId]);

  // A new view starts as it's defined: Structured all closed, Flattened all open.
  useEffect(() => {
    if (!tree) return;
    const edits = partEditsRef.current;
    const parts = edits.size === 0 ? tree.parts : new Map(tree.parts);
    for (const [partId, edit] of edits) parts.set(partId, { ...(parts.get(partId) ?? ({ id: partId } as PartModel)), ...edit });
    setRows(buildBomRows({ ...tree, parts }, view));
  }, [tree, view]);

  const changeView = (next: BomView) => {
    setView(next);
    try { localStorage.setItem(VIEW_STORAGE_KEY, next); } catch { /* not remembered */ }
  };

  /** A part saved in Part Portal: its rows (and the views built later) show the new values. */
  const handlePartSaved = (saved: PartModel) => {
    const fields = {
      name: partDisplayName(saved, saved.id),
      catalogNumber: saved.catalogNumber || "",
      revision: saved.revision || "",
      description: saved.description || "",
      engineer: saved.engineer || "",
      material: saved.material || "",
      mass: saved.mass || 0,
      price: saved.price || 0,
      comments: saved.comments || "",
    };
    partEditsRef.current.set(saved.id, {
      ...partEditsRef.current.get(saved.id),
      name: saved.name, catalogNumber: saved.catalogNumber, revision: saved.revision, description: saved.description,
      engineer: saved.engineer, material: saved.material, mass: saved.mass, price: saved.price, comments: saved.comments,
    });
    setRows((current) => current.map((r) => (!r.isSubAssembly && r.entityID === saved.id ? { ...r, ...fields } : r)));
  };

  const handleTableDataChange = (newData: BomTableRow[]) => {
    // 1. Instantly update local table state so typing has 0 lag
    setRows(newData);

    // 2. Queue debounced database updates (old rows looked up by id in one pass)
    const oldById = new Map(rows.map((r) => [r.id, r]));
    for (let i = 0; i < newData.length; i++) {
      const newRow = newData[i];
      const oldRow = oldById.get(newRow.id);

      const changed = oldRow && !newRow.isSubAssembly && newRow.entityID
        ? SAVED_PART_FIELDS.filter((k) => oldRow[k] !== newRow[k])
        : [];
      if (changed.length > 0) {
        const partId = newRow.entityID;
        // Kept in the loaded tree too, so switching views shows the edit.
        const edits = Object.fromEntries(changed.map((k) => [k, newRow[k]])) as Partial<PartModel>;
        partEditsRef.current.set(partId, { ...partEditsRef.current.get(partId), ...edits });
        pendingFieldsRef.current[partId] = {
          ...pendingFieldsRef.current[partId],
          ...Object.fromEntries(changed.map((k) => [k, newRow[k]])),
        };

        // Clear previous pending timeout for this specific part while typing
        if (saveTimeoutsRef.current[partId]) {
          clearTimeout(saveTimeoutsRef.current[partId]);
        }

        // Set a new timeout to send request 600ms after typing stops
        saveTimeoutsRef.current[partId] = setTimeout(async () => {
          // Only the changed fields: the rest of the record (e.g. a newer publish
          // from the extension) is left as it is.
          const payload = pendingFieldsRef.current[partId] ?? {};
          delete pendingFieldsRef.current[partId];
          try {

            // Same server as every other request (localhost:5050 when run locally);
            // throws on an HTTP error too, so a failed save is shown.
            await fetchFromApi(`/db/part/id/${encodeURIComponent(partId)}`, {
              method: "POST",
              body: JSON.stringify(payload),
            });
            setSaveErrors(({ [partId]: _done, ...rest }) => rest);
          } catch (err: any) {
            console.error("Failed to sync grid updates to part database:", err);
            // Kept for the next edit of this part, so a retry sends them again.
            pendingFieldsRef.current[partId] = { ...payload, ...pendingFieldsRef.current[partId] };
            setSaveErrors((prev) => ({ ...prev, [partId]: `"${newRow.name || partId}" wasn't saved: ${err?.message || err}` }));
          }
        }, 600);
      }
    }
  };

  /**
   * The row a table element belongs to, by the row id Table puts on each tr
   * (data-row-id). Not by position: sorting, filtering and collapsing change
   * which row is where. A part used twice has the same id on both rows; either
   * one is fine here.
   */
  const rowOfElement = (el: Element): BomTableRow | undefined => {
    const rowId = el.closest("[data-row-id]")?.getAttribute("data-row-id");
    return rowId == null ? undefined : rows.find((r) => r.id === rowId);
  };

  const handleTableClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const cellEl = target.closest(".table-td, td");
    if (!cellEl) return;

    const trEl = cellEl.closest(".table-tr, tr");
    if (!trEl) return;

    const clickedRow = rowOfElement(trEl);
    if (clickedRow) {
      // By column, not position: columns can be dragged into another order.
      if (cellEl.getAttribute("data-col-key") === "avatar") {
        setEnlargedImageSrc(clickedRow.avatar || "FAILED");
      }
    }
  };

  const handleTableContextMenuCapture = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const rowEl = target.closest(".table-tr, tr");
    if (!rowEl) return;

    e.preventDefault();
    e.stopPropagation();

    const row = rowOfElement(rowEl);
    if (row) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        row,
      });
    }
  };

  const handleShowPartData = async (row: BomTableRow) => {
    setContextMenu(null);
    // A sub-assembly marked standard (a motor...) is also saved as a part with
    // its BOM id; one the team makes has only its BOM record.
    const subBomId = row.isSubAssembly ? ((row as any).subBomId as string | undefined) : undefined;
    const partId = subBomId || row.entityID;
    if (!partId) return;

    try {
      const partData = await fetchFromApi<PartModel>(`/db/part/id/${encodeURIComponent(partId)}`);
      setSelectedPart(partData);
      setIsPartPortalOpen(true);
    } catch (err: any) {
      if (err?.statusCode === 404 && subBomId) {
        try {
          setSelectedSubBom(await fetchFromApi<BomModel>(`/db/bom/id/${encodeURIComponent(subBomId)}`));
        } catch (bomErr) {
          console.error("Failed to fetch sub-assembly data", bomErr);
          window.alert(`Couldn't load "${row.name || subBomId}".`);
        }
        return;
      }
      if (err?.statusCode === 404) {
        window.alert(`"${row.name || partId}" isn't saved in the database yet. Publish the BOM from the extension first.`);
        return;
      }
      console.error("Failed to fetch part data for modal portal", err);
      window.alert(`Couldn't load "${row.name || partId}": ${err?.message || "an unexpected error occurred."}`);
    }
  };

  const handleGoToSubBom = (row: BomTableRow) => {
    setContextMenu(null);
    const subBomId = (row as any).subBomId;
    if (subBomId) {
      navigate(`/bom/${subBomId}`);
    }
  };

  const pageBg = isLight ? "bg-zinc-50 text-zinc-900" : "bg-zinc-950 text-zinc-100";
  const loadingText = isLight ? "text-zinc-500" : "text-zinc-400";

  return (
    <div className={`p-8 min-h-screen transition-colors duration-200 ${pageBg}`}>
      <div className="flex justify-end mb-4">
        
      </div>

      {mainBomData && (
        <MainBomDataUI bom={mainBomData} />
      )}
      {Object.keys(saveErrors).length > 0 && (
        <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
          <p className="font-semibold">Changes not saved</p>
          {Object.entries(saveErrors).map(([id, message]) => <p key={id}>{message}</p>)}
        </div>
      )}
      {error && (
        <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
          <p className="font-semibold">Error Loading BOM Data</p>
          <p>{error.message}</p>
          {error.statusCode && <p className="text-sm">HTTP Status Code: {error.statusCode}</p>}
        </div>
      )}

      <div className="flex items-center gap-3 mb-3">
        <span className={`text-sm ${loadingText}`}>View:</span>
        <div className={`inline-flex rounded-lg border overflow-hidden ${isLight ? "border-zinc-300" : "border-zinc-700"}`} role="group" aria-label="BOM view">
          {BOM_VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              title={v.title}
              aria-pressed={view === v.key}
              onClick={() => changeView(v.key)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                view === v.key
                  ? "bg-blue-600 text-white"
                  : isLight ? "bg-white text-zinc-700 hover:bg-zinc-100" : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {/* Right of the view buttons, under the title card. */}
        <label className={`ml-auto flex items-center gap-2 cursor-pointer text-sm ${loadingText}`} title="Each made part&apos;s size in Onshape (bounding box, longest side first), saved by Publish BOM. Empty for bought parts and parts published before sizes were saved.">
          <input type="checkbox" checked={showSize} onChange={(e) => setShowSize(e.target.checked)} />
          Show size
        </label>
      </div>

      {loading ? (
        <div className={`p-8 text-center ${loadingText}`}>Loading BOM data...</div>
      ) : (
        <div 
          onClick={handleTableClick}
          onContextMenuCapture={handleTableContextMenuCapture} 
          className="relative cursor-pointer"
        >
          <Table
            data={rows}
            columnsData={showSize ? BomColumns : COLUMNS_WITHOUT_SIZE}
            setData={(newData) => handleTableDataChange(newData as BomTableRow[])}
            newRowFunction={undefined}
            initialSort={{ key: "catalogNumber", direction: "asc" }}
            // Like Excel's freeze panes: header row + avatar and name stay visible.
            stickyHeader
            frozenColumns={2}
          />

          {contextMenu && (
            <div
              className="context-menu"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
              {contextMenu.row.isSubAssembly && (
                <button
                  type="button"
                  onClick={() => handleGoToSubBom(contextMenu.row)}
                >
                  Go to Subassembly BOM
                </button>
              )}
              <button
                type="button"
                onClick={() => handleShowPartData(contextMenu.row)}
              >
                Show Part Data
              </button>
            </div>
          )}
        </div>
      )}

      {isPartPortalOpen && selectedPart && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setIsPartPortalOpen(false)}
              className="absolute top-4 right-4 z-10 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold"
            >
              ✕ Close
            </button>
            <PartPortal part={selectedPart} onSaved={handlePartSaved} />
          </div>
        </div>
      )}

      {selectedSubBom && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setSelectedSubBom(null)}
              className="absolute top-4 right-4 z-10 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold"
            >
              ✕ Close
            </button>
            <SubAssemblySummary bom={selectedSubBom} />
          </div>
        </div>
      )}

      {enlargedImageSrc && (
        <div 
          className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setEnlargedImageSrc(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setEnlargedImageSrc(null)}
              className="absolute -top-10 right-0 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold shadow-md"
            >
              ✕ Close
            </button>
            {enlargedImageSrc === "FAILED" || !enlargedImageSrc ? (
              <div className="w-96 h-96 bg-zinc-900 border border-zinc-700 rounded-xl flex flex-col items-center justify-center text-zinc-400 gap-2 shadow-2xl">
                <span className="text-xl font-bold">Image Failed to Load</span>
                <span className="text-xs font-mono text-zinc-500">NO IMAGE AVAILABLE</span>
              </div>
            ) : (
              <AuthenticatedImage
                src={enlargedImageSrc}
                alt="Enlarged Preview"
                className="max-w-full max-h-[85vh] object-contain rounded-xl border border-zinc-700 shadow-2xl"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}