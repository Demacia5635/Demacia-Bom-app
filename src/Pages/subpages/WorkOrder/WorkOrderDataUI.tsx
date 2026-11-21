import { useState, useEffect } from "react";
import type { WorkorderModel, BomModel } from "../../../util/Models";
import { fetchFromApi } from "../../../util/ApiService";
import { AuthenticatedImage } from "../../../components/AuthenticatedImage";
import { useThemeSync } from "../../../util/misc/useThemeSync";
import { recordImageSrc } from "../../../util/recordImage";
import ImageLightbox from "../../../components/ImageLightbox";

interface WorkOrderDataUIProps {
    workOrder: WorkorderModel;
}

const WorkOrderDataUI: React.FC<WorkOrderDataUIProps> = ({ workOrder }) => {
    const { isLight } = useThemeSync();
    const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null);
    // Kept with the id it was loaded for: another work order's BOM is never shown.
    const [loadedBom, setLoadedBom] = useState<{ bomID: string; bom: BomModel } | null>(null);
    const bomData = workOrder?.bomID && loadedBom?.bomID === workOrder.bomID ? loadedBom.bom : null;

    // Fetch the parent BOM data using workOrder.bomID to get its exact image source.
    // Another work order: a late reply for the previous one is ignored.
    useEffect(() => {
        const bomID = workOrder?.bomID;
        if (!bomID) return;
        let cancelled = false;
        fetchFromApi<BomModel>(`/db/bom/id/${encodeURIComponent(bomID)}`)
            .then((bom) => { if (!cancelled) setLoadedBom({ bomID, bom }); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [workOrder?.bomID]);

    const containerBg = isLight ? "bg-white border-zinc-200 text-zinc-900" : "bg-zinc-900 border-zinc-800 text-zinc-100";
    const imageBg = isLight ? "bg-zinc-100 border-zinc-200" : "bg-zinc-950 border-zinc-800";
    const textHeading = isLight ? "text-zinc-900" : "text-white";
    const textMuted = isLight ? "text-zinc-500" : "text-zinc-400";
    const textValue = isLight ? "text-zinc-800" : "text-zinc-200";
    const dividerBorder = isLight ? "border-zinc-200" : "border-zinc-800";

    // Resolve image source hierarchy matching the parent BOM exactly
    // The parent BOM's image; the work order's own until the BOM has loaded.
    const imageSrc = recordImageSrc(bomData) || recordImageSrc(workOrder);

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
                  {/* Not stored on the work order: the assembly's. */}
                  {bomData?.catalogNumber || "N/A"}
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
        <ImageLightbox src={enlargedImageSrc} onClose={() => setEnlargedImageSrc(null)} />
      </div>
    );
};

export default WorkOrderDataUI;