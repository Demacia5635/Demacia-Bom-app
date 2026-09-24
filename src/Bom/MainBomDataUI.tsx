import { useState } from "react";
import { AuthenticatedImage, fetchFromApi, type ApiError } from "../util/ApiService";
import { type BomModel, type WorkorderModel, type WorkorderPartModel as WorkOrderPartModel } from "../util/Models"
import { useThemeSync } from "../util/misc/useThemeSync";
import { createPortal } from "react-dom";
import { WorkOrderForm, type WorkOrderFormData } from "./CreatingWO";
import { useNavigate } from "react-router-dom";

const MainBomDataUI: React.FC<{ bom: BomModel }> = ({ bom }) => {
  const [isCreatingWO, setCreatingWO] = useState(false);
  const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null);
  const { isLight } = useThemeSync();
  const navigate = useNavigate();

  const visitedBoms = new Set<string>();

  async function fetchBomPartsRecursively(
    targetBomId: string
  ): Promise<WorkOrderPartModel[]> {
    if (visitedBoms.has(targetBomId)) return [];
    visitedBoms.add(targetBomId);

    const currentBom = await fetchFromApi<BomModel>(`/db/bom/id/${targetBomId}`);
    const collectedParts: WorkOrderPartModel[] = [];

    for (const sub of currentBom.subAssemblies || []) {
      const subParts = await fetchBomPartsRecursively(sub.bomID);
      collectedParts.push(...subParts);
    }

    for (const p of currentBom.parts || []) {
      const workOrderPart: WorkOrderPartModel = {
        partID: p.partID,
        quantityTotal: p.quantity,
        quantityMade: 0,
        statusCode: 0,
        productionGCOwner: "",
        productionMakingOwner: "",
        updatedAt: new Date(),
        createdAt: new Date(),
      };
      collectedParts.push(workOrderPart);
    }
    return collectedParts;
  }

  const handleNewWO = async (data: WorkOrderFormData) => {
    const id = Date.now().toString();
    const parts = await fetchBomPartsRecursively(bom.id);

    const payload: WorkorderModel = {
      id: id,
      name: data.name.trim(),
      bomID: bom.id,
      workOrderOwner: data.workOrderOwner.trim(),
      description: data.description.trim(),
      parts: parts,
      avatarID: bom.avatarID,
      comments: data.comments,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      const secret: string = import.meta.env.VITE_CLIENT_SECRET;
      const response = await fetch(`${import.meta.env.VITE_CLIENT_URL}/api/db/workOrder/id/${id}`, {
        method: "POST",
        headers: {
          "content-Type": "application/json",
          "x-client-secret": secret,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw {
          message: `Failed to create Work Order: ${response.statusText}`,
          statusCode: response.status
        } as ApiError;
      }

      navigate(`/workOrder/${id}`);
    } catch (err: any) {
      if (err.statusCode) {
        console.error(err);
      } else {
        console.error("An unexpected error occurred");
      }
    }
  };

  // Resolve image source hierarchy using Base64 avatarID or fallback to backend route
  let imageSrc = "";
  if (bom?.avatarID && typeof bom.avatarID === 'string' && bom.avatarID.startsWith("data:image")) {
    imageSrc = bom.avatarID;
  } else if (bom?.onshapeID?.documentID && bom?.onshapeID?.elementID) {
    const { documentID, wvmType = "w", wvmID, elementID } = bom.onshapeID;
    imageSrc = `/api/onshape/bom/d/${documentID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elementID}/thumbnail`;
  }

  // Theme styles mapping
  const containerBg = isLight ? "bg-white border-zinc-200 text-zinc-900" : "bg-zinc-900 border-zinc-800 text-zinc-100";
  const imageBg = isLight ? "bg-zinc-100 border-zinc-200" : "bg-zinc-950 border-zinc-800";
  const textHeading = isLight ? "text-zinc-900" : "text-white";
  const textMuted = isLight ? "text-zinc-500" : "text-zinc-400";
  const textValue = isLight ? "text-zinc-800" : "text-zinc-200";
  const dividerBorder = isLight ? "border-zinc-200" : "border-zinc-800";

  return (
    <div>
      <div className={`${containerBg} border rounded-2xl p-6 shadow-xl flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between transition-colors duration-200`}>
        <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center w-full lg:w-auto">
          <div 
            onClick={() => setEnlargedImageSrc(imageSrc || "FAILED")}
            className={`w-28 h-28 shrink-0 ${imageBg} border rounded-xl overflow-hidden flex items-center justify-center shadow-inner cursor-pointer hover:opacity-80 transition-opacity`}
            title="Click to enlarge image"
          >
            {imageSrc ? (
              <AuthenticatedImage
                src={imageSrc}
                alt={bom.name || "BOM Thumbnail"}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className={`${textMuted} text-xs font-mono`}>NO IMAGE</span>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className={`text-2xl font-bold tracking-tight ${textHeading}`}>
                {bom.name || "Unnamed Assembly"}
              </h1>
              {bom.description && (
                <p className={`text-sm ${textMuted} italic`}>
                  {bom.description}
                </p>
              )}
            </div>

            <div className={`flex items-center gap-4 text-xs ${textMuted} flex-wrap`}>
              <p>
                Catalog No:{" "}
                <span className={`${textValue} font-medium`}>
                  {bom.catalogNumber || "N/A"}
                </span>
              </p>
              <span>•</span>
              <p>
                Engineer:{" "}
                <span className={`${textValue} font-medium`}>
                  {bom.engineer || "N/A"}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Right side: Onshape link & Comments */}
        <div className={`flex flex-col items-start lg:items-end gap-3 self-stretch lg:self-auto shrink-0 border-t lg:border-t-0 ${dividerBorder} pt-4 lg:pt-0`}>
          <button
            onClick={() => setCreatingWO(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold tracking-wide transition-all shadow-md w-full lg:w-auto text-center"
          >
            Create Work Order
          </button>
          {bom.onshapeURL && (
            <a
              href={bom.onshapeURL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold tracking-wide transition-all shadow-md w-full lg:w-auto text-center"
            >
              Open Onshape CAD
            </a>
          )}

          {bom.comments && (
            <p className={`text-xs ${textMuted} italic max-w-xs text-left lg:text-right`}>
              {bom.comments}
            </p>
          )}
        </div>
      </div>
      
      {isCreatingWO && createPortal(
        <div
          onClick={() => setCreatingWO(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <div onClick={(e) => e.stopPropagation()}>
            <WorkOrderForm
              onSubmit={(data) => handleNewWO(data)}
              onCancel={() => setCreatingWO(false)}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Enlarged Image Preview Overlay Modal Portal */}
      {enlargedImageSrc && createPortal(
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
            {enlargedImageSrc === "FAILED" ? (
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
        </div>,
        document.body
      )}
    </div>
  );
}

export default MainBomDataUI;