import { useEffect, useState, useRef, type MouseEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Table from "../../../components/Table";
import { fetchFromApi, AuthenticatedImage, type ApiError } from "../../../util/ApiService";
import type { BomModel, PartModel } from "../../../util/Models";
import type BomTableRow from "./BomTableRow";
import MainBomDataUI from "./MainBomDataUI";
import BomColumns from "./BomColumns";
import PartPortal from "../../../Pages/searchPartsPage/PartPortal";
import { recordImageSrc } from "../../../util/recordImage";
import { fetchBomsByIds, fetchPartsByIds } from "../../../util/records";
import { useThemeSync } from "../../../util/misc/useThemeSync";
import { partDisplayName } from "../../../util/partDisplayName";

/** Part fields the table edits and saves (only the changed ones are sent). */
const SAVED_PART_FIELDS = [
  "name", "catalogNumber", "revision", "description", "engineer",
  "material", "mass", "price", "comments", "vendor",
] as const satisfies readonly (keyof BomTableRow)[];

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
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    row: BomTableRow;
  } | null>(null);
  const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null);

  // Ref to hold debounced save timeouts per part ID
  const saveTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Fields changed since that part's last save (an edit restarts the timer, so
  // earlier edits must still go out with the later one).
  const pendingFieldsRef = useRef<Record<string, Partial<BomTableRow>>>({});

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

  useEffect(() => {
    if (!bomId) return;

    async function fetchFlatBomData(targetBomId: string): Promise<BomTableRow[]> {
      const bom = await fetchFromApi<BomModel>(`/db/bom/id/${targetBomId}`);
      const collectedRows: BomTableRow[] = [];

      // All sub-assemblies and parts in two requests instead of one per item.
      const [subBoms, parts] = await Promise.all([
        fetchBomsByIds((bom.subAssemblies || []).map((s) => s.bomID)),
        fetchPartsByIds((bom.parts || []).map((p) => p.partID)),
      ]);

      for (const sub of bom.subAssemblies || []) {
        const subBomRecord = subBoms.get(sub.bomID) ?? null;
        let subAvatarUrl = recordImageSrc(subBomRecord as any);

        const subAssemblyRow: BomTableRow = {
          id: `sub-${sub.bomID}`,
          parentId: null,
          isExpanded: false,
          isSubAssembly: true,
          subBomId: sub.bomID,
          avatar: subAvatarUrl,
          name: partDisplayName(subBomRecord, sub.bomID),
          catalogNumber: subBomRecord?.catalogNumber || "",
          revision: "-",
          description: subBomRecord?.description || "",
          engineer: subBomRecord?.engineer || "",
          material: "-",
          mass: 0,
          price: 0,
          quantity: sub.quantity || 1,
          comments: subBomRecord?.comments || "",
          documentID: subBomRecord?.onshapeID?.documentID || "",
          wvmType: subBomRecord?.onshapeID?.wvmType || "w",
          wvmID: subBomRecord?.onshapeID?.wvmID || "",
          elementID: subBomRecord?.onshapeID?.elementID || "",
          entityID: subBomRecord?.onshapeID?.bomID || subBomRecord?.id || sub.bomID,
          onshapeURL: subBomRecord?.onshapeURL || "",
          exportSTL: "",
          exportParasolid: "",
          vendor: subBomRecord?.vendor || "",
        };

        collectedRows.push(subAssemblyRow);
      }

      for (const p of bom.parts || []) {
        // A part missing from the database shows as a plain row with its ID.
        const part = parts.get(p.partID) ?? ({ id: p.partID } as PartModel);

        let partAvatarUrl = recordImageSrc(part as any);

        const partRow: BomTableRow = {
          id: `part-${part.id}`,
          parentId: null,
          isExpanded: false,
          isSubAssembly: false,
          avatar: partAvatarUrl,
          name: partDisplayName(part, p.partID),
          catalogNumber: part.catalogNumber || "",
          revision: part.revision || "",
          description: part.description || "",
          engineer: part.engineer || "",
          material: part.material || "",
          mass: part.mass || 0,
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
        };
        collectedRows.push(partRow);
      }

      return collectedRows;
    }

    let cancelled = false;
    setRows([]);
    setError(null);
    setLoading(true);
    fetchFlatBomData(bomId)
      .then((data) => { if (!cancelled) setRows(data); })
      .catch((err: ApiError) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bomId]);

  const handleTableDataChange = (newData: BomTableRow[]) => {
    // 1. Instantly update local table state so typing has 0 lag
    setRows(newData);

    // 2. Queue debounced database updates
    for (let i = 0; i < newData.length; i++) {
      const newRow = newData[i];
      const oldRow = rows.find(r => r.id === newRow.id);

      const changed = oldRow && !newRow.isSubAssembly && newRow.entityID
        ? SAVED_PART_FIELDS.filter((k) => oldRow[k] !== newRow[k])
        : [];
      if (changed.length > 0) {
        const partId = newRow.entityID;
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
    const partId = row.entityID;
    if (!partId) return;

    try {
      const partData = await fetchFromApi<PartModel>(`/db/part/id/${encodeURIComponent(partId)}`);
      setSelectedPart(partData);
      setIsPartPortalOpen(true);
    } catch (err: any) {
      if (err?.statusCode === 404) {
        window.alert(`"${row.name || partId}" isn't saved in the database yet. Publish the BOM from the extension first.`);
        return;
      }
      console.error("Failed to fetch part data for modal portal", err);
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

      {loading ? (
        <div className={`p-8 text-center ${loadingText}`}>Fetching single-level BOM data...</div>
      ) : (
        <div 
          onClick={handleTableClick}
          onContextMenuCapture={handleTableContextMenuCapture} 
          className="relative cursor-pointer"
        >
          <Table
            data={rows}
            columnsData={BomColumns}
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
              {contextMenu.row.isSubAssembly ? (
                <button
                  type="button"
                  onClick={() => handleGoToSubBom(contextMenu.row)}
                >
                  Go to Subassembly BOM
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleShowPartData(contextMenu.row)}
                >
                  Show Part Data
                </button>
              )}
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
            <PartPortal part={selectedPart} />
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