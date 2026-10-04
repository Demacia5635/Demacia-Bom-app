import { useEffect, useState, useRef, type MouseEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Table from "../../../components/Table";
import { fetchFromApi, AuthenticatedImage, type ApiError } from "../../../util/ApiService";
import type { BomModel, PartModel } from "../../../util/Models";
import type BomTableRow from "./BomTableRow";
import MainBomDataUI from "./MainBomDataUI";
import BomColumns from "./BomColumns";
import PartPortal from "../../../Pages/searchPartsPage/PartPortal";

// Helper to extract Onshape identifiers from compound IDs or objects
const extractOnshapeIds = (record: any, fallbackId: string) => {
    let docID = record?.onshapeID?.documentID;
    let elemID = record?.onshapeID?.elementID;
    let wvmType = record?.onshapeID?.wvmType || "w";
    let wvmID = record?.onshapeID?.wvmID || "";
    let partID = record?.onshapeID?.partID || "";

    if ((!docID || !elemID) && fallbackId && fallbackId.includes("_")) {
        const partsArr = fallbackId.split("_");
        if (partsArr.length >= 4) {
            docID = partsArr[0];
            wvmType = partsArr[1] || "w";
            wvmID = partsArr[2] || "";
            elemID = partsArr[3];
            if (partsArr.length >= 5) {
                partID = partsArr[4];
            }
        }
    }
    return { docID, elemID, wvmType, wvmID, partID };
};

export default function BomDetailsPage() {
  const { bomId } = useParams<{ bomId: string }>();
  const navigate = useNavigate();

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

  const saveTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

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

      // 1. Optional: Fetch the main assembly metadata ONCE to get global context if needed
      const mainOnshapeIds = extractOnshapeIds(bom, bomId || "");
      let assemblyData: any = null;
      if (mainOnshapeIds.docID && mainOnshapeIds.elemID) {
        try {
          assemblyData = await fetchFromApi(
            `/onshape/assemblies/d/${mainOnshapeIds.docID}/wvmT/${mainOnshapeIds.wvmType}/wvmI/${mainOnshapeIds.wvmID}/e/${mainOnshapeIds.elemID}`
          ).catch(() => null);
        } catch (e) {
          console.warn("Could not fetch root assembly details in bulk", e);
        }
      }

      // Process sub-assemblies
      for (const sub of bom.subAssemblies || []) {
        const subBomRecord = await fetchFromApi<BomModel>(`/db/bom/id/${sub.bomID}`).catch(() => null);
        let subAvatarUrl = "";
        let onshapeName = "";

        const { docID, elemID, wvmType, wvmID } = extractOnshapeIds(subBomRecord, sub.bomID);

        if (docID && elemID) {
          try {
            const subAssembly: any = await fetchFromApi(`/onshape/assemblies/d/${docID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elemID}`);
            if (subAssembly?.name) {
              onshapeName = subAssembly.name;
            }
          } catch (err) {
            console.warn("Failed to fetch sub-assembly name from Onshape", err);
          }
        }

        if (subBomRecord?.driveFileId) {
          subAvatarUrl = `/api/drive/file/id/${subBomRecord.driveFileId}`;
        } else if (subBomRecord?.avatarID && typeof subBomRecord.avatarID === "string" && subBomRecord.avatarID.startsWith("data:image")) {
          subAvatarUrl = subBomRecord.avatarID;
        } else if (subBomRecord?.imageUrl) {
          subAvatarUrl = subBomRecord.imageUrl;
        } else if (docID && elemID) {
          subAvatarUrl = `/api/onshape/bom/d/${docID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elemID}/thumbnail`;
        }

        const finalName = onshapeName || subBomRecord?.title || subBomRecord?.partName || subBomRecord?.name || `Part ${sub.bomID.split("_").pop()}`;

        collectedRows.push({
          id: `sub-${sub.bomID}`,
          parentId: null,
          isExpanded: false,
          isSubAssembly: true,
          subBomId: sub.bomID,
          avatar: subAvatarUrl,
          name: finalName,
          catalogNumber: subBomRecord?.catalogNumber || "",
          revision: "-",
          description: subBomRecord?.description || "",
          engineer: subBomRecord?.engineer || "",
          material: "-",
          mass: 0,
          price: 0,
          quantity: sub.quantity || 1,
          comments: subBomRecord?.comments || "",
          documentID: docID,
          wvmType: wvmType,
          wvmID: wvmID,
          elementID: elemID,
          entityID: subBomRecord?.onshapeID?.bomID || subBomRecord?.id || sub.bomID,
          onshapeURL: subBomRecord?.onshapeURL || "",
          exportSTL: "",
          exportParasolid: "",
          vendor: subBomRecord?.vendor || "",
        });
      }

      // Process direct parts
      for (const p of bom.parts || []) {
        const part = await fetchFromApi<PartModel>(`/db/part/id/${p.partID}`).catch(() => null);

        let partAvatarUrl = "";
        let onshapePartName = "";

        const { docID, elemID, wvmType, wvmID, partID } = extractOnshapeIds(part, p.partID);

        if (docID && elemID) {
          try {
            const partsResponse: any = await fetchFromApi(`/onshape/parts/d/${docID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elemID}`);
            const matchedPart = Array.isArray(partsResponse) 
              ? partsResponse.find((pt: any) => pt.partId === partID || pt.id === partID)
              : null;
            if (matchedPart?.name) {
              onshapePartName = matchedPart.name;
            }
          } catch (err) {
            console.warn("Failed to fetch part name from Onshape", err);
          }
        }

        if (part?.driveFileId) {
          partAvatarUrl = `/api/drive/file/id/${part.driveFileId}`;
        } else if (part?.avatarID && typeof part.avatarID === "string" && part.avatarID.startsWith("data:image")) {
          partAvatarUrl = part.avatarID;
        } else if (part?.imageUrl) {
          partAvatarUrl = part.imageUrl;
        } else if (docID && elemID) {
          partAvatarUrl = `/api/onshape/part/d/${docID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elemID}/p/${partID || p.partID}/thumbnail`;
        }

        const finalPartName = onshapePartName || part?.title || part?.partName || part?.name || `Part ${p.partID.split("_").pop()}`;

        collectedRows.push({
          id: `part-${part?.id || p.partID}`,
          parentId: null,
          isExpanded: false,
          isSubAssembly: false,
          avatar: partAvatarUrl,
          name: finalPartName,
          catalogNumber: part?.catalogNumber || "",
          revision: part?.revision || "",
          description: part?.description || "",
          engineer: part?.engineer || "",
          material: part?.material || "",
          mass: part?.mass || 0,
          price: part?.price || 0,
          quantity: p.quantity || 1,
          comments: part?.comments || "",
          documentID: docID,
          wvmType: wvmType,
          wvmID: wvmID,
          elementID: elemID,
          entityID: p.partID,
          onshapeURL: part?.onshapeURL || "",
          exportSTL: part?.stlLink || "",
          exportParasolid: part?.parasolidLink || "",
          vendor: part?.vendor || ""
        });
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
    setRows(newData);

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

        if (saveTimeoutsRef.current[partId]) {
          clearTimeout(saveTimeoutsRef.current[partId]);
        }

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
            await fetch(`${backendBase}/api/db/part/id/${partId}`, {
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
      {mainBomData && <MainBomDataUI bom={mainBomData} />}
      {error && (
        <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
          <p className="font-semibold">Error Loading BOM Data</p>
          <p>{error.message}</p>
        </div>
      )}

      {loading ? (
        <div className={`p-8 text-center ${loadingText}`}>Fetching assembly structure from Onshape...</div>
      ) : (
        <div onClick={handleTableClick} onContextMenuCapture={handleTableContextMenuCapture} className="relative cursor-pointer">
          <Table
            data={rows}
            columnsData={BomColumns}
            setData={(newData) => handleTableDataChange(newData as BomTableRow[])}
            newRowFunction={undefined}
            initialSort={{ key: "catalogNumber", direction: "asc" }}
          />

          {contextMenu && (
            <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
              {contextMenu.row.isSubAssembly ? (
                <button type="button" onClick={() => handleGoToSubBom(contextMenu.row)}>Go to Subassembly BOM</button>
              ) : (
                <button type="button" onClick={() => handleShowPartData(contextMenu.row)}>Show Part Data</button>
              )}
            </div>
          )}
        </div>
      )}

      {isPartPortalOpen && selectedPart && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <button type="button" onClick={() => setIsPartPortalOpen(false)} className="absolute top-4 right-4 z-10 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold">✕ Close</button>
            <PartPortal part={selectedPart} />
          </div>
        </div>
      )}

      {enlargedImageSrc && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setEnlargedImageSrc(null)}>
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setEnlargedImageSrc(null)} className="absolute -top-10 right-0 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold shadow-md">✕ Close</button>
            {enlargedImageSrc === "FAILED" || !enlargedImageSrc ? (
              <div className="w-96 h-96 bg-zinc-900 border border-zinc-700 rounded-xl flex flex-col items-center justify-center text-zinc-400 gap-2 shadow-2xl">
                <span className="text-xl font-bold">Image Failed to Load</span>
                <span className="text-xs font-mono text-zinc-500">NO IMAGE AVAILABLE</span>
              </div>
            ) : (
              <AuthenticatedImage src={enlargedImageSrc} alt="Enlarged Preview" className="max-w-full max-h-[85vh] object-contain rounded-xl border border-zinc-700 shadow-2xl" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}