import { useEffect, useState, type MouseEvent } from "react";
import { useParams } from "react-router-dom";
import Table from "../components/Table";
import { fetchFromApi, AuthenticatedImage, type ApiError } from "../util/ApiService";
import { useThemeSync } from "../util/misc/useThemeSync";
import type { BomModel, PartModel } from "../util/Models";
import type BomTableRow from "./BomTableRow";
import MainBomDataUI from "./MainBomDataUI";
import BomColumns from "./BomColumns";
import PartPortal from "../searchParts/PartPortal";

export default function BomDetailsPage() {
  const { bomId } = useParams<{ bomId: string }>();
  const { isLight, toggleTheme } = useThemeSync();

  const [rows, setRows] = useState<BomTableRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [mainBomData, setMainBomData] = useState<BomModel | null>(null);

  // States for the PartPortal modal popup & custom context menu & enlarged image preview
  const [selectedPart, setSelectedPart] = useState<PartModel | null>(null);
  const [isPartPortalOpen, setIsPartPortalOpen] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    row: BomTableRow;
  } | null>(null);
  const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null);

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

    const visitedBoms = new Set<string>();

    async function fetchBomRecursively(
      targetBomId: string,
      parentId: string | null = null
    ): Promise<BomTableRow[]> {
      if (visitedBoms.has(targetBomId)) return [];
      visitedBoms.add(targetBomId);

      const bom = await fetchFromApi<BomModel>(`/db/bom/id/${targetBomId}`);
      const currentAssemblyRowId = `${parentId ? parentId + "-" : ""}${bom.id}`;

      // 1. Check MongoDB avatarID first. If missing, fallback to backend caching route.
      let assemblyAvatarUrl = "";
      if (bom?.avatarID && typeof bom.avatarID === 'string' && bom.avatarID.startsWith("data:image")) {
        assemblyAvatarUrl = bom.avatarID;
      } else if (bom?.onshapeID?.documentID && bom?.onshapeID?.elementID) {
        const { documentID, wvmType = "w", wvmID, elementID } = bom.onshapeID;
        assemblyAvatarUrl = `/api/onshape/bom/d/${documentID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elementID}/thumbnail`;
      }

      const assemblyRow: BomTableRow = {
        id: currentAssemblyRowId,
        parentId: parentId === bomId ? null : parentId,
        isExpanded: true,
        avatar: assemblyAvatarUrl,
        name: bom.name || targetBomId,
        catalogNumber: bom.catalogNumber || "",
        revision: "-",
        description: bom.description || "",
        engineer: bom.engineer || "",
        material: "-",
        mass: 0,
        price: 0,
        quantity: 1,
        comments: bom.comments || "",
        documentID: bom.onshapeID?.documentID || "",
        wvmType: bom.onshapeID?.wvmType || "",
        wvmID: bom.onshapeID?.wvmID || "",
        elementID: bom.onshapeID?.elementID || "",
        entityID: bom.onshapeID?.bomID || "",
        onshapeURL: bom.onshapeURL || "",
        exportSTL: "",
        exportParasolid: "",
        vendor: bom.vendor || "",
      };

      const collectedRows: BomTableRow[] = targetBomId === bomId ? [] : [assemblyRow];

      for (const sub of bom.subAssemblies || []) {
        const subRows = await fetchBomRecursively(sub.bomID, currentAssemblyRowId);
        collectedRows.push(...subRows);
      }

      for (const p of bom.parts || []) {
        const part = await fetchFromApi<PartModel>(`/db/part/id/${p.partID}`);

        // 2. Check MongoDB avatarID for parts first. If missing, fallback to backend route.
        let partAvatarUrl = "";
        if (part?.avatarID && typeof part.avatarID === 'string' && part.avatarID.startsWith("data:image")) {
          partAvatarUrl = part.avatarID;
        } else {
          const docID = part?.onshapeID?.documentID;
          const elemID = part?.onshapeID?.elementID;
          
          if (docID && elemID) {
            const wvmType = part.onshapeID?.wvmType || "w";
            const wvmID = part.onshapeID?.wvmID || "";
            const targetPartID = part.onshapeID?.partID || p.partID;
            
            partAvatarUrl = `/api/onshape/part/d/${docID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elemID}/p/${targetPartID}/thumbnail`;
          }
        }

        const partRow: BomTableRow = {
          id: `${currentAssemblyRowId}-part-${part.id}`,
          parentId: currentAssemblyRowId === bomId ? null : currentAssemblyRowId,
          isExpanded: false,
          avatar: partAvatarUrl,
          name: part.name || p.partID,
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
          wvmType: part.onshapeID?.wvmType || "",
          wvmID: part.onshapeID?.wvmID || "",
          elementID: part.onshapeID?.elementID || "",
          entityID: p.partID,
          onshapeURL: part.onshapeURL || "",
          exportSTL: part.stlLink || "",
          exportParasolid: part.parasolidLink || "",
          vendor: part.vendor || ""
        };
        collectedRows.push(partRow);
      }
      return collectedRows;
    }

    setLoading(true);
    fetchBomRecursively(bomId)
      .then((data) => setRows(data))
      .catch((err: ApiError) => setError(err))
      .finally(() => setLoading(false));
  }, [bomId]);

  // Handle table data alterations and save changes to MongoDB
  const handleTableDataChange = async (newData: BomTableRow[]) => {
    for (let i = 0; i < newData.length; i++) {
      const newRow = newData[i];
      const oldRow = rows.find(r => r.id === newRow.id);

      if (oldRow && newRow.entityID && (
        oldRow.name !== newRow.name ||
        oldRow.catalogNumber !== newRow.catalogNumber ||
        oldRow.revision !== newRow.revision ||
        oldRow.description !== newRow.description ||
        oldRow.engineer !== newRow.engineer ||
        oldRow.material !== newRow.material ||
        oldRow.mass !== newRow.mass ||
        oldRow.price !== newRow.price ||
        oldRow.comments !== newRow.comments
      )) {
        try {
          const partId = newRow.entityID;
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

          await fetch(`${import.meta.env.VITE_CLIENT_URL}/api/db/part/id/${partId}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-client-secret": import.meta.env.VITE_CLIENT_SECRET,
            },
            body: JSON.stringify(payload),
          });
        } catch (err) {
          console.error("Failed to sync grid updates to part database:", err);
        }
      }
    }

    setRows(newData);
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
      const partData = await fetchFromApi<PartModel>(`/db/part/id/${partId}`);
      setSelectedPart(partData);
      setIsPartPortalOpen(true);
    } catch (err) {
      console.error("Failed to fetch part data for modal portal", err);
    }
  };

  const pageBg = isLight ? "bg-zinc-50 text-zinc-900" : "bg-zinc-950 text-zinc-100";
  const loadingText = isLight ? "text-zinc-500" : "text-zinc-400";

  return (
    <div className={`p-8 min-h-screen transition-colors duration-200 ${pageBg}`}>
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={toggleTheme}
          className={`px-3 py-2 rounded font-medium text-sm ${isLight ? "bg-zinc-200 hover:bg-zinc-300 text-zinc-800" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"}`}
        >
          {isLight ? "🌙 Dark Mode" : "☀️ Light Mode"}
        </button>
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
        <div className={`p-8 text-center ${loadingText}`}>Recursively fetching BOM tree...</div>
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
          />

          {contextMenu && (
            <div
              className="context-menu"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
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