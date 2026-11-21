import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import type { WorkOrderRow } from "../../util/Models";
import { recordImageSrc } from "../../util/recordImage";
import ImageLightbox from "../../components/ImageLightbox";
import { useThemeClasses } from "../../util/misc/useThemeClasses";
import { CatalogNumber } from "../../components/CopyButton";

export const WorkOrderTable: React.FC<{ workOrders: WorkOrderRow[] }> = ({ workOrders }) => {
    const navigate = useNavigate();
    const theme = useThemeClasses();
    const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null);


    return (
        <div className={`${theme.cardWithText} border rounded-xl overflow-hidden shadow-md`}>
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className={`${theme.tableHeader} border-b ${theme.border} text-xs font-semibold uppercase tracking-wider`}>
                        <th className="py-3.5 px-4 w-24">Image</th>
                        <th className="py-3.5 px-4">Work Order Name</th>
                        <th className="py-3.5 px-4">Catalog Number</th>
                        <th className="py-3.5 px-4">BOM Name</th>
                        <th className="py-3.5 px-4">Owner</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {workOrders.map((wo) => {
                        // The page puts the assembly's image on the row when it has one.
                        const imageSrc = recordImageSrc(wo);

                        return (
                            <tr
                                key={wo.id}
                                onClick={() => navigate(`/workOrder/${wo.id}`)}
                                className={`${theme.rowHover} cursor-pointer transition-colors`}
                            >
                                <td 
                                    className="py-3 px-4"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEnlargedImageSrc(imageSrc || "FAILED");
                                    }}
                                >
                                    <div 
                                        className="w-12 h-12 rounded-lg overflow-hidden border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity"
                                        title="Click to enlarge image"
                                    >
                                        {imageSrc ? (
                                            <AuthenticatedImage
                                                src={imageSrc}
                                                alt={wo.name || "Work Order"}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className={`${theme.textMuted} text-[10px] font-mono`}>NO IMG</span>
                                        )}
                                    </div>
                                </td>
                                <td className="py-3 px-4 font-medium text-sm">
                                    {wo.name || "Unnamed Work Order"}
                                </td>
                                <td className={`py-3 px-4 text-sm ${theme.textMuted}`}>
                                    <CatalogNumber value={wo.catalogNumber} />
                                </td>
                                <td className={`py-3 px-4 text-sm ${theme.textMuted}`}>
                                    {wo.bomName || "N/A"}
                                </td>
                                <td className={`py-3 px-4 text-sm ${theme.textMuted}`}>
                                    {wo.workOrderOwner || "N/A"}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <ImageLightbox src={enlargedImageSrc} onClose={() => setEnlargedImageSrc(null)} />
        </div>
    );
};

export default WorkOrderTable;