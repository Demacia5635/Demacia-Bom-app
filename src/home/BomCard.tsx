import { useNavigate } from "react-router-dom";
import { AuthenticatedImage } from "../util/ApiService";
import { useThemeSync } from "../util/misc/useThemeSync";
import type { BomSummary } from "./HomePage";

export const BomCard: React.FC<{ bom: BomSummary }> = ({ bom }) => {
    const navigate = useNavigate();
    const { isLight } = useThemeSync();

    const cardBg = isLight 
        ? "bg-white border-zinc-200 hover:border-zinc-300 text-zinc-900" 
        : "bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-100";
    
    const imageBg = isLight ? "bg-zinc-100 border-zinc-200" : "bg-zinc-950 border-zinc-800";
    const textHeading = isLight ? "text-zinc-900" : "text-zinc-100";
    const textMuted = isLight ? "text-zinc-500" : "text-zinc-400";
    const textValue = isLight ? "text-zinc-800" : "text-zinc-200";

    // Safely check for onshapeID on BomSummary using type casting
    const bomOnshapeID = (bom as any).onshapeID;

    // Resolve image source hierarchy: Onshape ID -> Thumbnail URL -> Drive Avatar ID
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
        <div
            key={bom.id}
            onClick={() => navigate(`/bom/${bom.id}`)}
            className={`${cardBg} border rounded-xl p-5 cursor-pointer transition-all shadow-md flex flex-col justify-between`}
        >
            <div>
                <div className={`w-full h-40 ${imageBg} rounded-lg mb-4 flex items-center justify-center overflow-hidden border`}>
                    {imageSrc ? (
                        <AuthenticatedImage
                            src={imageSrc}
                            alt={bom.name || "BOM"}
                            className="w-full h-full object-cover" />
                    ) : (
                        <span className={`${textMuted} text-sm`}>No Image</span>
                    )}
                </div>
                <h2 className={`text-lg font-bold ${textHeading}`}>{bom.name || "Unnamed BOM"}</h2>
                <p className={`text-sm ${textMuted} mt-1`}>
                    <span className={textValue}>{bom.catalogNumber || "N/A"}</span>
                </p>
                <p className={`text-sm ${textMuted}`}>
                    <span className={textValue}>{bom.engineer || "N/A"}</span>
                </p>
            </div>
        </div>
    )
}

export default BomCard;