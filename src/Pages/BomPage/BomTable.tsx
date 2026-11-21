import { useState, useEffect, useMemo, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AuthenticatedImage, fetchFromApi } from "../../util/ApiService";
import { useThemeSync } from "../../util/misc/useThemeSync";
import { createPortal } from "react-dom";
import type { BomSummary } from "./BomsPage";
import type { BomModel } from "../../util/Models";
import { recordImageSrc } from "../../util/recordImage";
import { fetchBomsByIds } from "../../util/records";

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

  const imageSrc = recordImageSrc(bom as any);

  // Pre-check if this sub-assembly has any sub-assemblies inside it
  useEffect(() => {
    let isMounted = true;

    async function checkSubAssemblies() {
      // The list request already returns full records: no extra request needed.
      const listed = (bom as Partial<BomModel>).subAssemblies;
      if (Array.isArray(listed)) {
        setHasSubAssemblies(listed.length > 0);
        return;
      }
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
        const listed = (bom as Partial<BomModel>).subAssemblies;
        const fullBom = Array.isArray(listed) ? { subAssemblies: listed } : await fetchFromApi<BomModel>(`/db/bom/id/${bom.id}`);
        if (fullBom?.subAssemblies && fullBom.subAssemblies.length > 0) {
          // All sub-assemblies in one request.
          const records = await fetchBomsByIds(fullBom.subAssemblies.map((sub) => sub.bomID));
          const subBoms = await Promise.all(
            fullBom.subAssemblies.map(async (sub) => {
              // Older records also carry driveFileId / imageUrl (not in BomModel).
              const subBomRecord = (records.get(sub.bomID) ?? null) as (BomModel & { driveFileId?: string; imageUrl?: string }) | null;
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

  const tableBg = isLight ? "bg-white border-zinc-200 text-zinc-900" : "bg-zinc-900 border-zinc-800 text-zinc-100";
  const headerBg = isLight ? "bg-zinc-100 text-zinc-700" : "bg-zinc-950 text-zinc-300";
  const rowHover = isLight ? "hover:bg-zinc-50" : "hover:bg-zinc-800/50";
  const borderCol = isLight ? "border-zinc-200" : "border-zinc-800";
  const textMuted = isLight ? "text-zinc-500" : "text-zinc-400";

  // Only top-level assemblies: leave out any that is a sub-assembly of another.
  // The list request already returns each assembly's sub-assemblies.
  const rootBoms = useMemo(() => {
    const childBomIds = new Set<string>();
    for (const bom of boms) {
      for (const sub of (bom as Partial<BomModel>).subAssemblies ?? []) {
        if (sub.bomID) childBomIds.add(sub.bomID);
      }
    }
    return boms.filter((bom) => !childBomIds.has(bom.id));
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
          {rootBoms.length === 0 && (
            <tr>
              <td colSpan={3} className={`py-8 text-center text-sm ${textMuted}`}>
                No BOMs published yet. Publish one from the BOM extension in Onshape.
              </td>
            </tr>
          )}
          {rootBoms.map((bom) => (
            <BomRow
              key={bom.id}
              bom={bom}
              onImageClick={handleImageClick}
              rowHover={rowHover}
              borderCol={borderCol}
              textMuted={textMuted}
            />
          ))}
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