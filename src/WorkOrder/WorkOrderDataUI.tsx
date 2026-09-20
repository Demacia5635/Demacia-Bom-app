import { useState } from "react";
import type { WorkorderModel } from "../util/Models";
import { AuthenticatedImage } from "../util/ApiService";
import { useThemeSync } from "../util/misc/useThemeSync";
import { createPortal } from "react-dom";

interface WorkOrderDataUIProps {
    workOrder: WorkorderModel;
    assemblyThumbnailURL?: string;
}

const WorkOrderDataUI: React.FC<WorkOrderDataUIProps> = ({ workOrder, assemblyThumbnailURL }) => {
    const { isLight } = useThemeSync();
    const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null);

    const containerBg = isLight ? "bg-white border-zinc-200 text-zinc-900" : "bg-zinc-900 border-zinc-800 text-zinc-100";
    const imageBg = isLight ? "bg-zinc-100 border-zinc-200" : "bg-zinc-950 border-zinc-800";
    const textHeading = isLight ? "text-zinc-900" : "text-white";
    const textMuted = isLight ? "text-zinc-500" : "text-zinc-400";
    const textValue = isLight ? "text-zinc-800" : "text-zinc-200";
    const dividerBorder = isLight ? "border-zinc-200" : "border-zinc-800";

    // Resolve image source hierarchy safely
    let imageSrc = assemblyThumbnailURL || workOrder?.thumbnailURL || "";
    
    if (!imageSrc && workOrder?.onshapeID?.documentID && workOrder?.onshapeID?.elementID) {
        const { documentID, wvmType = "w", wvmID, elementID } = workOrder.onshapeID;
        imageSrc = `/api/onshape/bom/d/${documentID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elementID}/thumbnail`;
    }

    return (
      <div className={`${containerBg} border rounded-2xl p-6 shadow-xl flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between transition-colors duration-200 mb-6`}>
        <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center w-full lg:w-auto">
          <div 
            onClick={() => setEnlargedImageSrc(imageSrc || "FAILED")}
            className={`w-28 h-28 shrink-0 ${imageBg} border rounded-xl overflow-hidden flex items-center justify-center shadow-inner cursor-pointer hover:opacity-80 transition-opacity`}
            title="Click to enlarge image"
          >
            {imageSrc ? (
              <AuthenticatedImage
                src={imageSrc}
                alt={workOrder.name || "Work Order Thumbnail"}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className={`${isLight ? "text-zinc-400" : "text-zinc-600"} text-xs font-mono`}>NO IMAGE</span>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className={`text-2xl font-bold tracking-tight ${textHeading}`}>
                {workOrder.name || "Unnamed Assembly"}
              </h1>
              {workOrder.description && (
                <p className={`text-sm ${textMuted} italic`}>
                  {workOrder.description}
                </p>
              )}
            </div>

            <div className={`flex items-center gap-4 text-xs ${textMuted} flex-wrap`}>
              <p>
                Catalog No:{" "}
                <span className={`${textValue} font-medium`}>
                  {workOrder.catalogNumber || "N/A"}
                </span>
              </p>
              <span>•</span>
              <p>
                Owner:{" "}
                <span className={`${textValue} font-medium`}>
                  {workOrder.workOrderOwner || "N/A"}
                </span>
              </p>
              <span>•</span>
              <p>
                Parts:{" "}
                <span className={`${textValue} font-medium`}>
                  {workOrder.parts?.length || 0}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Right side: Comments */}
        <div className={`flex flex-col items-start lg:items-end gap-3 self-stretch lg:self-auto shrink-0 border-t lg:border-t-0 ${dividerBorder} pt-4 lg:pt-0`}>
          {workOrder.comments && (
            <p className={`text-xs ${textMuted} italic max-w-xs text-left lg:text-right`}>
              {workOrder.comments}
            </p>
          )}
        </div>

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
};

export default WorkOrderDataUI;