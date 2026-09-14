import { useNavigate } from "react-router-dom";
import { AuthenticatedImage } from "../util/ApiService";
import { useThemeSync } from "../util/misc/useThemeSync";
import type { WorkorderSummary } from "./HomePage";

export const WorkOrderCard: React.FC<{ workOrder: WorkorderSummary }> = ({ workOrder }) => {
    const navigate = useNavigate();
    const { isLight } = useThemeSync();

    const cardBg = isLight 
        ? "bg-white border-zinc-200 hover:border-zinc-300 text-zinc-900" 
        : "bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-100";
    
    const imageBg = isLight ? "bg-zinc-100 border-zinc-200" : "bg-zinc-950 border-zinc-800";
    const textHeading = isLight ? "text-zinc-900" : "text-zinc-100";
    const textMuted = isLight ? "text-zinc-500" : "text-zinc-400";
    const textValue = isLight ? "text-zinc-800" : "text-zinc-200";

    return (
        <div
            key={workOrder.id}
            onClick={() => navigate(`/workOrder/${workOrder.id}`)}
            className={`${cardBg} border rounded-xl p-5 cursor-pointer transition-all shadow-md flex flex-col justify-between`}>
            <div>
                <div className={`w-full h-40 ${imageBg} rounded-lg mb-4 flex items-center justify-center overflow-hidden border`}>
                    {workOrder.avatarID ? (
                        <AuthenticatedImage
                            src={`/drive/file/id/${workOrder.avatarID}`}
                            alt={workOrder.name || "WO"}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <span className={`${textMuted} text-sm`}>No Image</span>
                    )}
                </div>
                <h2 className={`text-lg font-bold ${textHeading}`}>{workOrder.name || "Unnamed Work Order"}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <p className={`text-sm ${textMuted} mt-1`}>
                        <span className={textValue}>{workOrder.catalogNumber || "N/A"}</span>
                    </p>
                    <p className={`text-sm ${textMuted} mt-1`}>
                        <span className={textValue}>{workOrder.bomName || "N/A"}</span>
                    </p>
                </div>
                <p className={`text-sm ${textMuted}`}>
                    <span className={textValue}>{workOrder.workOrderOwner || "N/A"}</span>
                </p>
            </div>
        </div>
    );
}

export default WorkOrderCard;