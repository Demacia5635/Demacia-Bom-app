import { useNavigate } from "react-router-dom";
import { AuthenticatedImage } from "../util/ApiService";
import { useThemeSync } from "../util/misc/useThemeSync";
import type { BomSummary } from "../home/HomePage";

export const BomTable: React.FC<{ boms: BomSummary[] }> = ({ boms }) => {
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
                        <th className="py-3.5 px-4">Assembly Name</th>
                        <th className="py-3.5 px-4">Engineer</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {boms.map((bom) => {
                        const bomOnshapeID = (bom as any).onshapeID;
                        let imageSrc = "";

                        if (bomOnshapeID?.documentID && bomOnshapeID?.elementID) {
                            const { documentID, wvmType = "w", wvmID, elementID } = bomOnshapeID;
                            imageSrc = `/api/onshape/bom/d/${documentID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elementID}/thumbnail`;
                        } else if ((bom as any)?.thumbnailURL) {
                            imageSrc = (bom as any).thumbnailURL;
                        } else if (bom?.avatarID) {
                            imageSrc = `/drive/file/id/${bom.avatarID}`;
                        }

                        return (
                            <tr
                                key={bom.id}
                                onClick={() => navigate(`/bom/${bom.id}`)}
                                className={`${rowHover} cursor-pointer transition-colors`}
                            >
                                <td className="py-3 px-4">
                                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center shrink-0">
                                        {imageSrc ? (
                                            <AuthenticatedImage
                                                src={imageSrc}
                                                alt={bom.name || "BOM"}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className={`${textMuted} text-[10px] font-mono`}>NO IMG</span>
                                        )}
                                    </div>
                                </td>
                                <td className="py-3 px-4 font-medium text-sm">
                                    {bom.name || "Unnamed BOM"}
                                </td>
                                <td className={`py-3 px-4 text-sm ${textMuted}`}>
                                    {bom.engineer || "N/A"}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default BomTable;