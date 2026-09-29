import { useState, useEffect, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AuthenticatedImage, fetchFromApi } from "../../util/ApiService";
import { useThemeSync } from "../../util/misc/useThemeSync";
import { createPortal } from "react-dom";
import type { BomSummary } from "./BomsPage";
import type { BomModel } from "../../util/Models";

interface BomRowProps {
  bom: BomSummary;
  level?: number;
  onImageClick: (e: MouseEvent, src: string) => void;
  rowHover: string;
  borderCol: string;
  textMuted: string;
}

const BomRow: React.FC<BomRowProps> = ({
  bom,
  level = 0,
  onImageClick,
  rowHover,
  borderCol,
  textMuted,
}) => {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [subAssemblies, setSubAssemblies] = useState<BomSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [hasSubAssemblies, setHasSubAssemblies] = useState<boolean | null>(null);

  const bomOnshapeID = (bom as any).onshapeID;
  let imageSrc = "";

  if ((bom as any)?.driveFileId) {
    imageSrc = `/api/drive/file/id/${(bom as any).driveFileId}`;
  } else if (bom?.avatarID && typeof bom.avatarID === "string" && bom.avatarID.startsWith("data:image")) {
    imageSrc = bom.avatarID;
  } else if ((bom as any)?.imageUrl) {
    imageSrc = (bom as any).imageUrl;
  } else if (bomOnshapeID?.documentID && bomOnshapeID?.elementID) {
    const { documentID, wvmType = "w", wvmID = "", elementID } = bomOnshapeID;
    imageSrc = `/api/onshape/bom/d/${documentID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elementID}/thumbnail`;
  } else if ((bom as any)?.thumbnailURL) {
    imageSrc = (bom as any).thumbnailURL;
  }

  // Pre-check if this sub-assembly has any sub-assemblies inside it
  useEffect(() => {
    let isMounted = true;

    async function checkSubAssemblies() {
      try {
        const fullBom = await fetchFromApi<BomModel>(`/db/bom/id/${bom.id}`);
        if (isMounted) {
          setHasSubAssemblies(Boolean(fullBom?.subAssemblies && fullBom.subAssemblies.length > 0));
        }
      } catch (err) {
        if (isMounted) setHasSubAssemblies(false);
      }
    }

    checkSubAssemblies();

    return () => {
      isMounted = false;
    };
  }, [bom.id]);

  const handleToggleExpand = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!hasSubAssemblies) return;

    if (!isExpanded && subAssemblies.length === 0) {
      setLoading(true);
      try {
        const fullBom = await fetchFromApi<BomModel>(`/db/bom/id/${bom.id}`);
        if (fullBom?.subAssemblies && fullBom.subAssemblies.length > 0) {
          const subBoms = await Promise.all(
            fullBom.subAssemblies.map(async (sub) => {
              const subBomRecord = await fetchFromApi<BomModel>(`/db/bom/id/${sub.bomID}`).catch(() => null);
              return {
                id: sub.bomID,
                name: subBomRecord?.name || sub.bomID,
                engineer: subBomRecord?.engineer || "",
                driveFileId: subBomRecord?.driveFileId,
                avatarID: subBomRecord?.avatarID,
                imageUrl: subBomRecord?.imageUrl,
                onshapeID: subBomRecord?.onshapeID,
              } as BomSummary;
            })
          );
          setSubAssemblies(subBoms);
        }
      } catch (err) {
        console.error("Failed to load sub-assemblies:", err);
      } finally {
        setLoading(false);
      }
    }

    setIsExpanded((prev) => !prev);
  };

  return (
    <>
      <tr
        onClick={() => navigate(`/bom/${bom.id}`)}
        className={`${rowHover} cursor-pointer transition-colors border-b ${borderCol}`}
      >
        <td
          className="py-3 px-4"
          onClick={(e) => {
            e.stopPropagation();
            onImageClick(e, imageSrc || "FAILED");
          }}
        >
          <div
            className="w-12 h-12 rounded-lg overflow-hidden border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity"
            style={{ marginLeft: `${level * 24}px` }}
            title="Click to enlarge image"
          >
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
          <div className="flex items-center gap-2">
            {/* Show expand arrow ONLY if sub-assemblies exist */}
            {hasSubAssemblies ? (
              <button
                type="button"
                onClick={handleToggleExpand}
                className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                title="Toggle Subassemblies"
              >
                {loading ? "⏳" : isExpanded ? "▼" : "▶"}
              </button>
            ) : (
              <span className="w-5" /> // Alignment spacer when no arrow
            )}
            <span>{bom.name || "Unnamed BOM"}</span>
          </div>
        </td>
        <td className={`py-3 px-4 text-sm ${textMuted}`}>
          {bom.engineer || "N/A"}
        </td>
      </tr>

      {isExpanded &&
        subAssemblies.map((subBom) => (
          <BomRow
            key={`${bom.id}-${subBom.id}`}
            bom={subBom}
            level={level + 1}
            onImageClick={onImageClick}
            rowHover={rowHover}
            borderCol={borderCol}
            textMuted={textMuted}
          />
        ))}
    </>
  );
};

export const BomTable: React.FC<{ boms: BomSummary[] }> = ({ boms }) => {
  const { isLight } = useThemeSync();
  const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null);
  const [rootBoms, setRootBoms] = useState<BomSummary[]>([]);
  const [filtering, setFiltering] = useState<boolean>(true);

  const tableBg = isLight ? "bg-white border-zinc-200 text-zinc-900" : "bg-zinc-900 border-zinc-800 text-zinc-100";
  const headerBg = isLight ? "bg-zinc-100 text-zinc-700" : "bg-zinc-950 text-zinc-300";
  const rowHover = isLight ? "hover:bg-zinc-50" : "hover:bg-zinc-800/50";
  const borderCol = isLight ? "border-zinc-200" : "border-zinc-800";
  const textMuted = isLight ? "text-zinc-500" : "text-zinc-400";

  // Filter out any BOM that is referenced as a sub-assembly inside another BOM
  useEffect(() => {
    let isMounted = true;

    async function filterChildBoms() {
      setFiltering(true);
      try {
        const childBomIds = new Set<string>();

        await Promise.all(
          boms.map(async (bom) => {
            const fullBom = await fetchFromApi<BomModel>(`/db/bom/id/${bom.id}`).catch(() => null);
            if (fullBom?.subAssemblies) {
              fullBom.subAssemblies.forEach((sub) => {
                if (sub.bomID) childBomIds.add(sub.bomID);
              });
            }
          })
        );

        if (isMounted) {
          // Keep only top-level root BOMs
          setRootBoms(boms.filter((bom) => !childBomIds.has(bom.id)));
        }
      } catch (err) {
        console.error("Failed to filter child BOMs:", err);
        if (isMounted) setRootBoms(boms);
      } finally {
        if (isMounted) setFiltering(false);
      }
    }

    if (boms.length > 0) {
      filterChildBoms();
    } else {
      setRootBoms([]);
      setFiltering(false);
    }

    return () => {
      isMounted = false;
    };
  }, [boms]);

  const handleImageClick = (e: MouseEvent, src: string) => {
    e.stopPropagation();
    setEnlargedImageSrc(src);
  };

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
        <tbody>
          {filtering ? (
            <tr>
              <td colSpan={3} className={`py-8 text-center text-sm ${textMuted}`}>
                Structuring assembly tree...
              </td>
            </tr>
          ) : (
            rootBoms.map((bom) => (
              <BomRow
                key={bom.id}
                bom={bom}
                onImageClick={handleImageClick}
                rowHover={rowHover}
                borderCol={borderCol}
                textMuted={textMuted}
              />
            ))
          )}
        </tbody>
      </table>

      {/* Enlarged Image Preview Overlay Modal Portal */}
      {enlargedImageSrc &&
        createPortal(
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

export default BomTable;