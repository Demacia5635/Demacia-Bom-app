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

// Comprehensive sanitizer to check all potential database fields for the real Onshape name
const getCleanPartName = (record: any, entityID: string) => {
    if (record?.title && typeof record.title === 'string' && !record.title.includes('_')) return record.title;
    if (record?.partName && typeof record.partName === 'string' && !record.partName.includes('_')) return record.partName;
    if (record?.fileName && typeof record.fileName === 'string' && !record.fileName.includes('_')) return record.fileName;
    if (record?.properties?.name && typeof record.properties.name === 'string' && !record.properties.name.includes('_')) return record.properties.name;
    if (record?.metadata?.name && typeof record.metadata.name === 'string' && !record.metadata.name.includes('_')) return record.metadata.name;

    const rawName = record?.name;
    
    if (rawName && typeof rawName === 'string' && !rawName.includes('_') && rawName.length < 50) {
        return rawName;
    }

    if (record?.catalogNumber && typeof record.catalogNumber === 'string' && record.catalogNumber.trim() !== '' && !record.catalogNumber.includes('_')) {
        return record.catalogNumber;
    }
    if (record?.description && typeof record.description === 'string' && record.description.trim() !== '' && !record.description.includes('_') && record.description.length < 50) {
        return record.description;
    }

    if (entityID && entityID.includes('_')) {
        const segments = entityID.split('_');
        return `Part ${segments[segments.length - 1]}`;
    }

    return rawName || entityID;
};

export default function BomDetailsPage() {
  const { bomId } = useParams<{ bomId: string }>();
  const navigate = useNavigate();

  // 🛡️️ Bulletproof theme definition
  const isLight = typeof window !== "undefined" 
    ? document.documentElement.classList.contains("light") || window.matchMedia("(prefers-color-scheme: light)").matches 
    : true;

  const [rows, setRows] = useState<BomTableRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);
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

  useEffect(() => {
    if (!bomId) return;

    fetchFromApi<BomModel>(`/db/bom/id/${bomId}`).then((bom) => {
      setMainBomData(bom);
    });
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
          name: getCleanPartName(subBomRecord, sub.bomID),
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
          name: getCleanPartName(part, p.partID),
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

    setLoading(true);
    fetchFlatBomData(bomId)
      .then((data) => setRows(data))
      .catch((err: ApiError) => setError(err))
      .finally(() => setLoading(false));
  }, [bomId]);

  const handleTableDataChange = (newData: BomTableRow[]) => {
    // 1. Instantly update local table state so typing has 0 lag
    setRows(newData);

    // 2. Queue debounced database updates
    for (let i = 0; i < newData.length; i++) {
      const newRow = newData[i];
      const oldRow = rows.find(r => r.id === newRow.id);

      if (oldRow && !newRow.isSubAssembly && newRow.entityID && (
        oldRow.name !== newRow.name ||
        oldRow.catalogNumber !== newRow.catalogNumber ||
        oldRow.revision !== newRow.revision ||
        oldRow.description !== newRow.description ||
        oldRow.engineer !== newRow.engineer ||
        oldRow.material !== newRow.material ||
        oldRow.mass !== newRow.mass ||
        oldRow.price !== newRow.price ||
        oldRow.comments !== newRow.comments ||
        oldRow.vendor !== newRow.vendor
      )) {
        const partId = newRow.entityID;

        // Clear previous pending timeout for this specific part while typing
        if (saveTimeoutsRef.current[partId]) {
          clearTimeout(saveTimeoutsRef.current[partId]);
        }

        // Set a new timeout to send request 600ms after typing stops
        saveTimeoutsRef.current[partId] = setTimeout(async () => {
          try {
            const payload = {
              name: newRow.name,
              catalogNumber: newRow.catalogNumber,
              revision: newRow.revision,
              description: newRow.description,
              engineer: newRow.engineer,
              material: newRow.material,
              mass: newRow.mass,
              price: newRow.price,
              comments: newRow.comments,
              vendor: newRow.vendor
            };

            const backendBase = import.meta.env.VITE_CLIENT_URL || "https://demacia-bom-app-n2ag.onrender.com";
            await fetch(`${backendBase}/api/db/part/id/${encodeURIComponent(partId)}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-client-secret": import.meta.env.VITE_CLIENT_SECRET || "",
              },
              body: JSON.stringify(payload),
            });
          } catch (err) {
            console.error("Failed to sync grid updates to part database:", err);
          }
        }, 600);
      }
    }
  };

  const handleTableClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const cellEl = target.closest(".table-td, td");
    if (!cellEl) return;

    const trEl = cellEl.closest(".table-tr, tr");
    if (!trEl) return;

    const tbody = trEl.closest("tbody") || trEl.parentElement;
    if (!tbody) return;

    const trs = Array.from(tbody.querySelectorAll(".table-tr, tr"));
    const rowIndex = trs.indexOf(trEl);

    if (rowIndex !== -1 && rows[rowIndex]) {
      const clickedRow = rows[rowIndex];
      const cellsInRow = Array.from(trEl.querySelectorAll(".table-td, td"));
      const cellIndex = cellsInRow.indexOf(cellEl);

      if (cellIndex === 0) {
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

    const tbody = rowEl.closest("tbody") || rowEl.parentElement;
    if (!tbody) return;

    const trs = Array.from(tbody.querySelectorAll(".table-tr, tr"));
    const rowIndex = trs.indexOf(rowEl);

    if (rowIndex !== -1 && rows[rowIndex]) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        row: rows[rowIndex],
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