import { useNavigate } from "react-router-dom";
import { AuthenticatedImage } from "../util/ApiService";
import { useThemeSync } from "../util/misc/useThemeSync";
import type { WorkorderSummary } from "./HomePage";

export const WorkOrderTable: React.FC<{ workOrders: WorkorderSummary[] }> = ({ workOrders }) => {
    const navigate = useNavigate();
    const { isLight } = useThemeSync();

    const tableBg = isLight ? "bg-white border-zinc-200 text-zinc-900" : "bg-zinc-900 border-zinc-800 text-zinc-100";
    const headerBg = isLight ? "bg-zinc-100 text-zinc-700" : "bg-zinc-950 text-zinc-300";
    const rowHover = isLight ? "hover:bg-zinc-50" : "hover:bg-zinc-800/50";
    const borderCol = isLight ? "border-zinc-200" : "border-zinc-800";
    const textMuted = isLight ? "text-zinc-500" : "text-zinc-400";

    return (
        <div className={`${tableBg} border rounded-xl overflow-hidden shadow-md`}>
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className={`${headerBg} border-b ${borderCol} text-xs font-semibold uppercase tracking-wider`}>
                        <th className="py-3.5 px-4 w-24">Image</th>
                        <th className="py-3.5 px-4">Work Order Name</th>
                        <th className="py-3.5 px-4">Catalog Number</th>
                        <th className="py-3.5 px-4">BOM Name</th>
                        <th className="py-3.5 px-4">Owner</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {workOrders.map((wo) => {
                        const rawWO = wo as any;
                        let imageSrc = "";

                        if (rawWO?.onshapeID?.documentID && rawWO?.onshapeID?.elementID) {
                            const { documentID, wvmType = "w", wvmID, elementID } = rawWO.onshapeID;
                            imageSrc = `/api/onshape/bom/d/${documentID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elementID}/thumbnail`;
                        } else if (rawWO?.thumbnailURL) {
                            imageSrc = rawWO.thumbnailURL;
                        } else if (wo?.avatarID && wo.avatarID.length > 10) {
                            imageSrc = `/drive/file/id/${wo.avatarID}`;
                        }

                        return (
                            <tr
                                key={wo.id}
                                onClick={() => navigate(`/workOrder/${wo.id}`)}
                                className={`${rowHover} cursor-pointer transition-colors`}
                            >
                                <td className="py-3 px-4">
                                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center shrink-0">
                                        {imageSrc ? (
                                            <AuthenticatedImage
                                                src={imageSrc}
                                                alt={wo.name || "Work Order"}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className={`${textMuted} text-[10px] font-mono`}>NO IMG</span>
                                        )}
                                    </div>
                                </td>
                                <td className="py-3 px-4 font-medium text-sm">
                                    {wo.name || "Unnamed Work Order"}
                                </td>
                                <td className={`py-3 px-4 text-sm ${textMuted}`}>
                                    {wo.catalogNumber || "N/A"}
                                </td>
                                <td className={`py-3 px-4 text-sm ${textMuted}`}>
                                    {wo.bomName || "N/A"}
                                </td>
                                <td className={`py-3 px-4 text-sm ${textMuted}`}>
                                    {wo.workOrderOwner || "N/A"}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default WorkOrderTable;