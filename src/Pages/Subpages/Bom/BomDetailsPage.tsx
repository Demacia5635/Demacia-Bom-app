import { useEffect, useMemo, useState, useRef, type MouseEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Table from "../../../components/Table";
import { fetchFromApi, type ApiError } from "../../../util/ApiService";
import type { BomModel, PartModel } from "../../../util/Models";
import type BomTableRow from "./BomTableRow";
import MainBomDataUI from "./MainBomDataUI";
import SubAssemblySummary from "./SubAssemblySummary";
import BomColumns from "./BomColumns";
import PartPortal from "../../../Pages/SearchPartsPage/PartPortal";
import { recordImageSrc } from "../../../util/recordImage";
import { loadBomTree, workOrderLines, type BomTree } from "../../../util/bomTree";
import { useThemeSync } from "../../../util/misc/useThemeSync";
import { partDisplayName } from "../../../util/partDisplayName";
import { readShowSize, writeShowSize } from "../../../util/partSize";
import ImageLightbox from "../../../components/ImageLightbox";
import RecordDialog from "../../../components/RecordDialog";
import { useRowContextMenu } from "../../../components/useRowContextMenu";
import { useDebouncedFieldSave } from "../../../components/useDebouncedFieldSave";
import ErrorBanner, { ApiErrorText } from "../../../components/ErrorBanner";
import { useThemeClasses } from "../../../util/misc/useThemeClasses";
import { showToast } from "../../../util/toast";
import { usePartInAddress } from "../../../components/usePartInAddress";
import SaveStatus from "../../../components/SaveStatus";
import { SkeletonTable } from "../../../components/Skeleton";
import BomWorkOrders from "./BomWorkOrders";

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
        avatar: recordImageSrc(record),
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
        avatar: recordImageSrc(part),
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
  const theme = useThemeClasses();

  const [rows, setRows] = useState<BomTableRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);
  /** Failed cell saves by part id (each cleared when that part saves). */
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [mainBomData, setMainBomData] = useState<BomModel | null>(null);

  const [selectedPart, setSelectedPart] = useState<PartModel | null>(null);
  // ?part=<id> opens that part's Part Portal, and the address follows it (shareable link).
  usePartInAddress(selectedPart, setSelectedPart);
  /** "Show Part Data" of a made sub-assembly (only a BOM record): read-only summary. */
  const [selectedSubBom, setSelectedSubBom] = useState<BomModel | null>(null);
  const { menu: contextMenu, openFor: openContextMenu, close: closeContextMenu } = useRowContextMenu<BomTableRow>();
  const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null);
  const [tree, setTree] = useState<BomTree | null>(null);
  // The header's totals: distinct parts and pieces for one assembly (QW11).
  const treeTotals = useMemo(() => {
    if (!tree) return undefined;
    try {
      const { totals } = workOrderLines(tree);
      return { parts: totals.size, quantity: [...totals.values()].reduce((a, b) => a + b, 0) };
    } catch {
      return undefined; // a BOM that contains itself: the table says what's wrong
    }
  }, [tree]);
  const [view, setView] = useState<BomView>(savedView);
  /** "Show size" checkbox, shared with the work-order page (remembered in this browser). */
  const [showSize, setShowSize] = useState(readShowSize);
  useEffect(() => writeShowSize(showSize), [showSize]);

  // Edits go out shortly after the last change, per part and only the changed
  // fields: the rest of the record (e.g. a newer publish from the extension) is
  // left as it is. A failed save is shown, and retried with the part's next edit.
  const queuePartSave = useDebouncedFieldSave({
    trackAs: "part",
    save: (partId, changes) =>
      fetchFromApi(`/db/part/id/${encodeURIComponent(partId)}`, { method: "POST", body: JSON.stringify(changes) }),
    onSaved: (partId) => setSaveErrors(({ [partId]: _done, ...rest }) => rest),
    onFailed: (partId, err: any, name) => {
      console.error("Failed to sync grid updates to part database:", err);
      setSaveErrors((prev) => ({ ...prev, [partId]: `"${name || partId}" wasn't saved: ${err?.message || err}` }));
    },
  });
  // Edits made on this page, per part: laid over the loaded tree when a view
  // builds its rows, so switching views shows them (the tree itself is state
  // and isn't changed in place).
  const partEditsRef = useRef<Map<string, Partial<PartModel>>>(new Map());


  // The whole assembly tree, loaded once per BOM (another BOM is a new page:
  // App.tsx keys it by id); each view builds its rows from it.
  useEffect(() => {
    if (!bomId) return;
    let cancelled = false;
    loadBomTree(bomId, (root) => { if (!cancelled) setMainBomData(root); })
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
        queuePartSave(partId, edits, newRow.name);
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

  const handleTableContextMenuCapture = (e: MouseEvent<HTMLDivElement>) => openContextMenu(e, rowOfElement);

  const handleShowPartData = async (row: BomTableRow) => {
    closeContextMenu();
    // A sub-assembly marked standard (a motor...) is also saved as a part with
    // its BOM id; one the team makes has only its BOM record.
    const subBomId = row.isSubAssembly ? row.subBomId : undefined;
    const partId = subBomId || row.entityID;
    if (!partId) return;

    try {
      const partData = await fetchFromApi<PartModel>(`/db/part/id/${encodeURIComponent(partId)}`);
      setSelectedPart(partData);
    } catch (err: any) {
      if (err?.statusCode === 404 && subBomId) {
        try {
          setSelectedSubBom(await fetchFromApi<BomModel>(`/db/bom/id/${encodeURIComponent(subBomId)}`));
        } catch (bomErr) {
          console.error("Failed to fetch sub-assembly data", bomErr);
          showToast(`Couldn't load "${row.name || subBomId}".`, "error");
        }
        return;
      }
      if (err?.statusCode === 404) {
        showToast(`"${row.name || partId}" isn't saved in the database yet. Publish the BOM from the extension first.`, "info");
        return;
      }
      console.error("Failed to fetch part data for modal portal", err);
      showToast(`Couldn't load "${row.name || partId}": ${err?.message || "an unexpected error occurred."}`, "error");
    }
  };

  const handleGoToSubBom = (row: BomTableRow) => {
    closeContextMenu();
    const subBomId = row.subBomId;
    if (subBomId) {
      navigate(`/bom/${subBomId}`);
    }
  };


  return (
    <div className={`p-8 min-h-screen transition-colors duration-200 ${theme.page}`}>

      {mainBomData && (
        <MainBomDataUI bom={mainBomData} totals={treeTotals} />
      )}
      {/* The assembly's work orders, each a link (QW4). */}
      {bomId && mainBomData && (
        <div className="mt-4">
          <BomWorkOrders bomId={bomId} />
        </div>
      )}
      {Object.keys(saveErrors).length > 0 && (
        <ErrorBanner title="Changes not saved" className="mb-6 p-4 rounded-lg">
          {Object.entries(saveErrors).map(([id, message]) => <p key={id}>{message}</p>)}
        </ErrorBanner>
      )}
      {error && (
        <ErrorBanner title="Error Loading BOM Data" className="mb-6 p-4 rounded-lg">
          <ApiErrorText error={error} />
        </ErrorBanner>
      )}

      <div className="flex items-center gap-3 mb-3">
        <span className={`text-sm ${theme.textMuted}`}>View:</span>
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
        {/* Right of the view buttons, under the title card: save status, then "Show size". */}
        <span className="ml-auto"><SaveStatus /></span>
        <label className={`flex items-center gap-2 cursor-pointer text-sm ${theme.textMuted}`} title="Each made part&apos;s size in Onshape (bounding box, longest side first), saved by Publish BOM. Empty for bought parts and parts published before sizes were saved.">
          <input type="checkbox" checked={showSize} onChange={(e) => setShowSize(e.target.checked)} />
          Show size
        </label>
      </div>

      {loading ? (
        <SkeletonTable label="Loading the BOM…" columns={9} />
      ) : (
        <div 
          onClick={handleTableClick}
          onContextMenuCapture={handleTableContextMenuCapture} 
          className="relative cursor-pointer"
        >
          <Table
            data={rows}
            columnsData={showSize ? BomColumns : COLUMNS_WITHOUT_SIZE}
            setData={handleTableDataChange}
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

      {selectedPart && (
        <RecordDialog onClose={() => setSelectedPart(null)}>
          <PartPortal key={selectedPart.id} part={selectedPart} onSaved={handlePartSaved} />
        </RecordDialog>
      )}

      {selectedSubBom && (
        <RecordDialog onClose={() => setSelectedSubBom(null)}>
          <SubAssemblySummary bom={selectedSubBom} />
        </RecordDialog>
      )}

      <ImageLightbox src={enlargedImageSrc} onClose={() => setEnlargedImageSrc(null)} />
    </div>
  );
}