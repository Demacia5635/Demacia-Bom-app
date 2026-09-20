import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthenticatedImage, fetchFromApi } from "../util/ApiService";
import { useThemeSync } from "../util/misc/useThemeSync";
import type { BomModel, WorkorderModel } from "../util/Models";
import type { WorkorderSummary } from "./HomePage";

export const WorkOrderCard: React.FC<{ workOrder: WorkorderSummary }> = ({ workOrder }) => {
    const navigate = useNavigate();
    const { isLight } = useThemeSync();
    const [imageSrc, setImageSrc] = useState<string>("");

    const cardBg = isLight 
        ? "bg-white border-zinc-200 hover:border-zinc-300 text-zinc-900" 
        : "bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-100";
    
    const imageBg = isLight ? "bg-zinc-100 border-zinc-200" : "bg-zinc-950 border-zinc-800";
    const textHeading = isLight ? "text-zinc-900" : "text-zinc-100";
    const textMuted = isLight ? "text-zinc-500" : "text-zinc-400";
    const textValue = isLight ? "text-zinc-800" : "text-zinc-200";

    useEffect(() => {
        let isMounted = true;

        async function resolveThumbnail() {
            try {
                // 1. Check summary or casted onshapeID / thumbnailURL
                const rawWO = workOrder as any;
                if (rawWO?.onshapeID?.documentID && rawWO?.onshapeID?.elementID) {
                    const { documentID, wvmType = "w", wvmID, elementID } = rawWO.onshapeID;
                    if (isMounted) setImageSrc(`/api/onshape/bom/d/${documentID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elementID}/thumbnail`);
                    return;
                }
                if (rawWO?.thumbnailURL) {
                    if (isMounted) setImageSrc(rawWO.thumbnailURL);
                    return;
                }

                // 2. Fetch full work order model using its ID to retrieve bomID
                const fullWO = await fetchFromApi<WorkorderModel>(`/db/workOrder/id/${workOrder.id}`);
                if (fullWO?.bomID) {
                    const bom = await fetchFromApi<BomModel>(`/db/bom/id/${fullWO.bomID}`);
                    if (bom?.onshapeID?.documentID && bom?.onshapeID?.elementID) {
                        const { documentID, wvmType = "w", wvmID, elementID } = bom.onshapeID;
                        if (isMounted) setImageSrc(`/api/onshape/bom/d/${documentID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elementID}/thumbnail`);
                        return;
                    }
                    if (bom?.avatarID) {
                        if (isMounted) setImageSrc(`/drive/file/id/${bom.avatarID}`);
                        return;
                    }
                }

                // 3. Last resort fallback to summary avatarID if valid
                if (rawWO?.avatarID && rawWO.avatarID.length > 10) {
                    if (isMounted) setImageSrc(`/drive/file/id/${rawWO.avatarID}`);
                }
            } catch (err) {
                // Fail silently to "NO IMAGE"
            }
        }

        resolveThumbnail();

        return () => {
            isMounted = false;
        };
    }, [workOrder]);

    return (
        <div
            key={workOrder.id}
            onClick={() => navigate(`/workOrder/${workOrder.id}`)}
            className={`${cardBg} border rounded-xl p-5 cursor-pointer transition-all shadow-md flex flex-col justify-between`}
        >
            <div>
                <div className={`w-full h-40 ${imageBg} rounded-lg mb-4 flex items-center justify-center overflow-hidden border`}>
                    {imageSrc ? (
                        <AuthenticatedImage
                            src={imageSrc}
                            alt={workOrder.name || "WO"}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <span className={`${textMuted} text-sm font-mono`}>NO IMAGE</span>
                    )}
                </div>
                <h2 className={`text-lg font-bold ${textHeading}`}>{workOrder.name || "Unnamed Work Order"}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <p className={`text-sm ${textMuted} mt-1`}>
                        Catalog: <span className={textValue}>{workOrder.catalogNumber || "N/A"}</span>
                    </p>
                    <p className={`text-sm ${textMuted} mt-1`}>
                        BOM: <span className={textValue}>{workOrder.bomName || "N/A"}</span>
                    </p>
                </div>
                <p className={`text-sm ${textMuted} mt-1`}>
                    Owner: <span className={textValue}>{workOrder.workOrderOwner || "N/A"}</span>
                </p>
            </div>
        </div>
    );
}

export default WorkOrderCard;