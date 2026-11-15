import { AuthenticatedImage } from "../../../util/ApiService";
import type { BomModel } from "../../../util/Models";
import { useThemeSync } from "../../../util/misc/useThemeSync";
import { openExternal } from "../../../util/openExternal";
import { partDisplayName } from "../../../util/partDisplayName";
import { recordImageSrc } from "../../../util/recordImage";

/**
 * "Show Part Data" for a sub-assembly the team makes: it has only a BOM
 * record, so PartPortal (which saves to the part records) isn't used.
 * Read-only by choice; it's edited in the extension.
 */
export default function SubAssemblySummary({ bom }: { bom: BomModel }) {
    const { isLight } = useThemeSync();
    const imageSrc = recordImageSrc(bom as any);

    const containerBg = isLight ? "bg-white border-zinc-300 text-zinc-900 shadow-xl" : "bg-zinc-900 border-zinc-800 text-zinc-100 shadow-2xl";
    const imageBoxBg = isLight ? "bg-zinc-100 border-zinc-200" : "bg-zinc-950 border-zinc-800";
    const labelColor = isLight ? "text-zinc-600" : "text-zinc-500";
    const valueColor = isLight ? "text-zinc-800" : "text-zinc-200";

    const fields: [string, string | undefined][] = [
        ["Catalog #", bom.catalogNumber],
        ["Description", bom.description],
        ["Engineer", bom.engineer],
        ["Comments", bom.comments],
    ];

    return (
        <div className={`w-full max-w-4xl border rounded-2xl p-6 sm:p-8 space-y-6 my-auto transition-colors duration-200 ${containerBg}`}>
            <div className="flex items-center gap-5 pr-20">
                <div className={`w-24 h-24 shrink-0 border rounded-xl overflow-hidden flex items-center justify-center ${imageBoxBg}`}>
                    {imageSrc ? (
                        <AuthenticatedImage src={imageSrc} alt={bom.name || "Sub-assembly"} className="w-full h-full object-cover" />
                    ) : (
                        <span className={`${labelColor} text-[10px] font-mono`}>NO IMAGE</span>
                    )}
                </div>
                <div className="min-w-0 space-y-1">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-blue-500/15 text-blue-500">
                        Sub-assembly
                    </span>
                    <h2 className="text-xl font-bold break-words">{partDisplayName(bom, bom.id)}</h2>
                </div>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {fields.map(([label, value]) => (
                    <div key={label} className={label === "Description" || label === "Comments" ? "sm:col-span-2" : ""}>
                        <dt className={`text-xs font-semibold uppercase tracking-wide ${labelColor}`}>{label}</dt>
                        <dd className={`mt-1 text-sm whitespace-pre-wrap break-words ${valueColor}`}>{value?.trim() || "—"}</dd>
                    </div>
                ))}
            </dl>

            <div className="flex flex-wrap items-center gap-3">
                {bom.onshapeURL && (
                    <button
                        type="button"
                        onClick={() => openExternal(bom.onshapeURL)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                    >
                        Open Onshape
                    </button>
                )}
                <span className={`text-xs ${labelColor}`}>Read-only here. Edit sub-assemblies in the BOM extension.</span>
            </div>
        </div>
    );
}
