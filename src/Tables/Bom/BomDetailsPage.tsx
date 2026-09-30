import { useEffect, useState, type MouseEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Table from "../../components/Table";
import { fetchFromApi, AuthenticatedImage, type ApiError } from "../../util/ApiService";
import { useThemeSync } from "../../util/misc/useThemeSync";
import type { BomModel, PartModel } from "../../util/Models";
import type BomTableRow from "./BomTableRow";
import MainBomDataUI from "./MainBomDataUI";
import BomColumns from "./BomColumns";
import PartPortal from "../../Pages/searchPartsPage/PartPortal";

// Comprehensive sanitizer to check all potential database fields for the real Onshape name
const getCleanPartName = (record: any, entityID: string) => {
    // 1. Check alternative database / Onshape metadata fields
    if (record?.title && typeof record.title === 'string' && !record.title.includes('_')) return record.title;
    if (record?.partName && typeof record.partName === 'string' && !record.partName.includes('_')) return record.partName;
    if (record?.fileName && typeof record.fileName === 'string' && !record.fileName.includes('_')) return record.fileName;
    if (record?.properties?.name && typeof record.properties.name === 'string' && !record.properties.name.includes('_')) return record.properties.name;
    if (record?.metadata?.name && typeof record.metadata.name === 'string' && !record.metadata.name.includes('_')) return record.metadata.name;

    const rawName = record?.name;
    
    // 2. If rawName is a clean human-readable name (does not contain underscores)
    if (rawName && typeof rawName === 'string' && !rawName.includes('_') && rawName.length < 50) {
        return rawName;
    }

    // 3. Fall back to catalog number or description if they contain clean text
    if (record?.catalogNumber && typeof record.catalogNumber === 'string' && record.catalogNumber.trim() !== '' && !record.catalogNumber.includes('_')) {
        return record.catalogNumber;
    }
    if (record?.description && typeof record.description === 'string' && record.description.trim() !== '' && !record.description.includes('_') && record.description.length < 50) {
        return record.description;
    }

    // 4. Final fallback: If the database record genuinely only has the compound ID, 
    // display a clean fallback or part identifier rather than a blank cell or raw ID string.
    if (entityID && entityID.includes('_')) {
        const segments = entityID.split('_');
        return `Part ${segments[segments.length - 1]}`;
    }

    return rawName || entityID;
};

export default function BomDetailsPage() {
  const { bomId } = useParams<{ bomId: string }>();
  const navigate = useNavigate();
  const { isLight, toggleTheme } = useThemeSync();

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

      // Process sub-assemblies as flat rows without expanding their children
      for (const sub of bom.subAssemblies || []) {
        const subBomRecord = await fetchFromApi<BomModel>(`/db/bom/id/${sub.bomID}`).catch(() => null);
        let subAvatarUrl = "";

        if (subBomRecord?.driveFileId) {
          subAvatarUrl = `/api/drive/file/id/${subBomRecord.driveFileId}`;
        } else if (subBomRecord?.avatarID && typeof subBomRecord.avatarID === "string" && subBomRecord.avatarID.startsWith("data:image")) {
          subAvatarUrl = subBomRecord.avatarID;
        } else if (subBomRecord?.imageUrl) {
          subAvatarUrl = subBomRecord.imageUrl;
        } else if (subBomRecord?.onshapeID?.documentID && subBomRecord?.onshapeID?.elementID) {
          const docID = subBomRecord.onshapeID.documentID;
          const wType = subBomRecord.onshapeID.wvmType || "w";
          const wID = subBomRecord.onshapeID.wvmID || "";
          const elemID = subBomRecord.onshapeID.elementID;
          subAvatarUrl = `/api/onshape/bom/d/${docID}/wvmT/${wType}/wvmI/${wID}/e/${elemID}/thumbnail`;
        } else {
          const partsArr = sub.bomID.split("_");
          if (partsArr.length >= 4) {
            subAvatarUrl = `/api/onshape/bom/d/${partsArr[0]}/wvmT/${partsArr[1] || "w"}/wvmI/${partsArr[2] || ""}/e/${partsArr[3]}/thumbnail`;
          }
        }

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

      // Process direct parts as flat rows
      for (const p of bom.parts || []) {
        const part = await fetchFromApi<PartModel>(`/db/part/id/${p.partID}`);

        let partAvatarUrl = "";

        if (part?.driveFileId) {
          partAvatarUrl = `/api/drive/file/id/${part.driveFileId}`;
        } else if (part?.avatarID && typeof part.avatarID === "string" && part.avatarID.startsWith("data:image")) {
          partAvatarUrl = part.avatarID;
        } else if (part?.imageUrl) {
          partAvatarUrl = part.imageUrl;
        } else {
          let docID = part?.onshapeID?.documentID;
          let elemID = part?.onshapeID?.elementID;
          let wvmType = part?.onshapeID?.wvmType || "w";
          let wvmID = part?.onshapeID?.wvmID || "";
          let targetPartID = part?.onshapeID?.partID || p.partID;

          if (!docID && part?.id && part.id.includes("_")) {
            const partsArr = part.id.split("_");
            if (partsArr.length >= 5) {
              docID = partsArr[0];
              wvmType = partsArr[1];
              wvmID = partsArr[2];
              elemID = partsArr[3];
              targetPartID = partsArr[4];
            }
          }

          if (docID && elemID) {
            partAvatarUrl = `/api/onshape/part/d/${docID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elemID}/p/${targetPartID}/thumbnail`;
          }
        }

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
          vendor: part.vendor || ""
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

  const handleTableDataChange = async (newData: BomTableRow[]) => {
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