import React, { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from "react";
import { downloadDriveFile, fetchFromApi } from "../../util/ApiService";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import { useThemeSync } from "../../util/misc/useThemeSync";
import { isPurchasedPart, type PartModel, type BomModel } from "../../util/Models";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { recordImageSrc } from "../../util/recordImage";
import { openExternal } from "../../util/openExternal";

/** The fields this form edits. Everything else (files, Onshape IDs, …) belongs to the extension's publish. */
const EDITABLE_FIELDS = ["name", "catalogNumber", "revision", "engineer", "material", "mass", "price", "description", "comments"] as const;

/** `onSaved`: called with the part as saved, so the page behind can show the new values. */
const PartPortal: React.FC<{ part: PartModel; onSaved?: (part: PartModel) => void }> = ({ part, onSaved }) => {
    const { isLight } = useThemeSync();
    const navigate = useNavigate();

    // Bought parts (a vendor, Onshape Standard Content, or marked standard in the
    // extension) are locked, as in the extension.
    // A part with no vendor field at all isn't one.
    const locked = isPurchasedPart(part);
    const [formData, setFormData] = useState<PartModel>({ ...part });
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null);

    // Linked BOM states
    const [isCheckingBoms, setIsCheckingBoms] = useState(false);
    const [linkedBoms, setLinkedBoms] = useState<BomModel[]>([]);
    const [isBomModalOpen, setIsBomModalOpen] = useState(false);

    // The values as last loaded or saved, to send only what was changed since.
    const savedValuesRef = useRef<PartModel>(part);

    useEffect(() => {
        setFormData({ ...part });
        savedValuesRef.current = part;
    }, [part]);

    const handleChange = (
        e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value, type } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === "number" ? (value === "" ? undefined : Number(value)) : value,
        }));
        setSaved(false);
    };

    const handleUpsert = async (e: FormEvent) => {
        e.preventDefault();
        if (locked) return; // bought parts are edited in the extension (Enter in a field would submit)
        setIsSaving(true);
        setSaveError(null);
        setSaved(false);

        try {
            // Only the edited fields that changed: the rest of the record (e.g. a
            // publish from the extension while this was open) is left as it is.
            const changes = Object.fromEntries(
                EDITABLE_FIELDS.filter((k) => formData[k] !== savedValuesRef.current[k]).map((k) => [k, formData[k]])
            );
            if (Object.keys(changes).length > 0) {
                // Same server as every other request (localhost:5050 when run locally).
                await fetchFromApi(`/db/part/id/${encodeURIComponent(part.id)}`, {
                    method: "POST",
                    body: JSON.stringify(changes),
                });
                savedValuesRef.current = { ...savedValuesRef.current, ...changes };
                onSaved?.(savedValuesRef.current);
            }
            setSaved(true);
        } catch (err: any) {
            setSaveError(`Failed to save the part: ${err?.message || "an unexpected error occurred."}`);
        } finally {
            setIsSaving(false);
        }
    };

    // Handler to find and navigate to linked BOMs with fallback endpoint support & detailed logging
    const handleLinkedBomClick = async () => {
        if (!part?.id) return;
        setIsCheckingBoms(true);
        try {
            const allBoms = await fetchFromApi<BomModel[]>(`/db/bom/all`);

            const matchingBoms = (allBoms || []).filter((bom) => 
                bom.parts?.some((p) => p.partID === part.id)
            );

            if (matchingBoms.length === 1) {
                navigate(`/bom/${matchingBoms[0].id}`);
            } else if (matchingBoms.length > 1) {
                setLinkedBoms(matchingBoms);
                setIsBomModalOpen(true);
            } else {
                alert("This part is not currently linked to any BOM assemblies.");
            }
        } catch (err) {
            console.error("Failed to fetch BOM list for linked assembly lookup:", err);
            alert("Could not retrieve linked BOMs. Check console for details.");
        } finally {
            setIsCheckingBoms(false);
        }
    };

    // Image from the saved record (Google Drive); no Onshape fallback.
    const avatarUrl = recordImageSrc(formData as any);

    // Dynamic theme classes
    const containerBg = isLight ? "bg-white border-zinc-300 text-zinc-900 shadow-xl" : "bg-zinc-900 border-zinc-800 text-zinc-100 shadow-2xl";
    const headerBorder = isLight ? "border-zinc-200" : "border-zinc-800";
    const imageBoxBg = isLight ? "bg-zinc-100 border-zinc-200" : "bg-zinc-950 border-zinc-800";
    const labelColor = isLight ? "text-zinc-600" : "text-zinc-500";
    const inputBg = isLight ? "bg-zinc-50 border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:ring-blue-600/50" : "bg-zinc-950 border-zinc-800 text-white placeholder-zinc-600 focus:ring-blue-500/50";
    const cardBg = isLight ? "bg-zinc-50 border-zinc-200" : "bg-zinc-950 border-zinc-800/80";
    const subInputBg = isLight ? "bg-white border-zinc-300 text-zinc-900 focus:ring-blue-600/50" : "bg-zinc-900 border-zinc-800 text-zinc-100 focus:ring-blue-500/50";
    const textAreaColor = isLight ? "text-zinc-800" : "text-zinc-200";
    const commentsColor = isLight ? "text-zinc-700 italic" : "text-zinc-300 italic";

    return (
        <div className={`w-full max-w-4xl border rounded-2xl p-6 sm:p-8 space-y-6 my-auto max-h-[90vh] overflow-y-auto transition-colors duration-200 ${containerBg}`}>
            {/* Header */}
            <div className={`flex items-start justify-between gap-4 border-b pb-5 ${headerBorder}`}>
                <div className="flex items-center gap-5 w-full">
                    <div 
                        onClick={() => setEnlargedImageSrc(avatarUrl || "FAILED")}
                        className={`w-24 h-24 shrink-0 border rounded-xl overflow-hidden flex items-center justify-center shadow-inner cursor-pointer hover:opacity-80 transition-opacity ${imageBoxBg}`}
                        title="Click to enlarge image"
                    >
                        {avatarUrl ? (
                            <AuthenticatedImage
                                src={avatarUrl}
                                alt={formData.name || "Part Avatar"}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <span className={`text-[10px] font-mono ${isLight ? "text-zinc-400" : "text-zinc-600"}`}>NO IMAGE</span>
                        )}
                    </div>

                    <div className="flex-1 space-y-2">
                        <div className="space-y-1">
                            <label className={`text-[10px] font-semibold uppercase tracking-wider block ${labelColor}`}>
                                Part Name
                            </label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name || ""}
                                onChange={handleChange}
                                disabled={locked}
                                placeholder="Enter Part Name"
                                className={`w-full border rounded-lg px-3.5 py-2 text-lg font-bold focus:outline-none focus:ring-2 ${inputBg}`}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {saveError && (
                <div className="p-3.5 bg-red-900/40 border border-red-500/50 rounded-xl text-xs text-red-200">
                    {saveError}
                </div>
            )}

            <form onSubmit={handleUpsert} className="space-y-6">
                {/* Row 1: Catalog Number & Revision & Engineer */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className={`border rounded-xl p-3.5 space-y-1.5 ${cardBg}`}>
                        <label className={`text-[10px] font-semibold uppercase tracking-wider block ${labelColor}`}>
                            Catalog Number
                        </label>
                        <input
                            type="text"
                            name="catalogNumber"
                            value={formData.catalogNumber || ""}
                            disabled={locked}
                            onChange={handleChange}
                            placeholder="e.g. PN-1002"
                            className={`w-full border rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 ${subInputBg}`}
                        />
                    </div>

                    <div className={`border rounded-xl p-3.5 space-y-1.5 ${cardBg}`}>
                        <label className={`text-[10px] font-semibold uppercase tracking-wider block ${labelColor}`}>
                            Revision
                        </label>
                        <input
                            type="text"
                            name="revision"
                            value={formData.revision || ""}
                            disabled={locked}
                            onChange={handleChange}
                            placeholder="e.g. Rev A"
                            className={`w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 ${subInputBg}`}
                        />
                    </div>

                    <div className={`border rounded-xl p-3.5 space-y-1.5 ${cardBg}`}>
                        <label className={`text-[10px] font-semibold uppercase tracking-wider block ${labelColor}`}>
                            Engineer
                        </label>
                        <input
                            type="text"
                            name="engineer"
                            value={formData.engineer || ""}
                            disabled={locked}
                            onChange={handleChange}
                            placeholder="Engineer name"
                            className={`w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 ${subInputBg}`}
                        />
                    </div>
                </div>

                {/* Row 2: Material & Mass & Price */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className={`border rounded-xl p-3.5 space-y-1.5 ${cardBg}`}>
                        <label className={`text-[10px] font-semibold uppercase tracking-wider block ${labelColor}`}>
                            Material
                        </label>
                        <input
                            type="text"
                            name="material"
                            value={formData.material || ""}
                            disabled={locked}
                            onChange={handleChange}
                            placeholder="e.g. Aluminum 6061"
                            className={`w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 ${subInputBg}`}
                        />
                    </div>

                    <div className={`border rounded-xl p-3.5 space-y-1.5 ${cardBg}`}>
                        <label className={`text-[10px] font-semibold uppercase tracking-wider block ${labelColor}`}>
                            Mass (kg)
                        </label>
                        <input
                            type="number"
                            step="any"
                            name="mass"
                            value={formData.mass ?? ""}
                            disabled={locked}
                            onChange={handleChange}
                            placeholder="0.00"
                            className={`w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 ${subInputBg}`}
                        />
                    </div>

                    <div className={`border rounded-xl p-3.5 space-y-1.5 ${cardBg}`}>
                        <label className={`text-[10px] font-semibold uppercase tracking-wider block ${labelColor}`}>
                            Price ($)
                        </label>
                        <input
                            type="number"
                            step="any"
                            name="price"
                            value={formData.price ?? ""}
                            disabled={locked}
                            onChange={handleChange}
                            placeholder="0.00"
                            className={`w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 ${subInputBg}`}
                        />
                    </div>
                </div>

                {/* Row 3: Links & Media Keys (4 Cards Layout) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className={`border rounded-xl p-3.5 space-y-1.5 ${cardBg}`}>
                        <label className={`text-[10px] font-semibold uppercase tracking-wider block ${labelColor}`}>
                            Onshape CAD URL
                        </label>
                        <button
                            type="button"
                            disabled={!part.onshapeURL}
                            onClick={() => openExternal(part.onshapeURL)}
                            className="mx-auto px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Open Onshape
                        </button>
                    </div>

                    <div className={`border rounded-xl p-3.5 space-y-1.5 ${cardBg}`}>
                        <label className={`text-[10px] font-semibold uppercase tracking-wider block ${labelColor}`}>
                            STL Model Link
                        </label>
                        <button
                            type="button"
                            disabled={!part.stlLink}
                            onClick={() => part.stlLink && downloadDriveFile(part.stlLink, `${part.name || "part"}.stl`)}
                            className="mx-auto px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Download STL
                        </button>
                    </div>

                    <div className={`border rounded-xl p-3.5 space-y-1.5 ${cardBg}`}>
                        <label className={`text-[10px] font-semibold uppercase tracking-wider block ${labelColor}`}>
                            Parasolid Model Link
                        </label>
                        <button
                            type="button"
                            disabled={!part.parasolidLink}
                            onClick={() => part.parasolidLink && downloadDriveFile(part.parasolidLink, `${part.name || "part"}.x_t`)}
                            className="mx-auto px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Download Parasolid
                        </button>
                    </div>

                    <div className={`border rounded-xl p-3.5 space-y-1.5 ${cardBg}`}>
                        <label className={`text-[10px] font-semibold uppercase tracking-wider block ${labelColor}`}>
                            Linked Assembly / BOM
                        </label>
                        <button
                            type="button"
                            onClick={handleLinkedBomClick}
                            disabled={isCheckingBoms}
                            className="mx-auto px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isCheckingBoms ? "Checking..." : "View Linked BOM ↗"}
                        </button>
                    </div>
                </div>

                {/* Expanded Description Section */}
                <div className={`border rounded-xl p-4 space-y-1.5 ${cardBg}`}>
                    <label className={`text-[10px] font-semibold uppercase tracking-wider block ${labelColor}`}>
                        Description
                    </label>
                    <textarea
                        name="description"
                        rows={3}
                        value={formData.description || ""}
                        onChange={handleChange}
                        disabled={locked}
                        placeholder="Detailed description of the part..."
                        className={`w-full border rounded-lg p-3 text-xs placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-y ${subInputBg} ${textAreaColor}`}
                    />
                </div>

                {/* Expanded Comments Section */}
                <div className={`border rounded-xl p-4 space-y-1.5 ${cardBg}`}>
                    <label className={`text-[10px] font-semibold uppercase tracking-wider block ${labelColor}`}>
                        Comments & Notes
                    </label>
                    <textarea
                        name="comments"
                        rows={4}
                        value={formData.comments || ""}
                        onChange={handleChange}
                        disabled={locked}
                        placeholder="Additional manufacturing notes, comments, or issues..."
                        className={`w-full border rounded-lg p-3 text-xs placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-y ${subInputBg} ${commentsColor}`}
                    />
                </div>

                {/* Footer Actions */}
                {/* Onshape opens from its card, next to the STL / Parasolid downloads. */}
                <div className={`flex flex-col sm:flex-row items-center justify-end gap-4 pt-3 border-t ${headerBorder}`}>
                    {/* The note is on the wrapper: a disabled button gets no hover in some browsers. */}
                    <div
                        className="flex items-center gap-3 w-full sm:w-auto"
                        title={locked ? "Bought parts are edited in the BOM extension." : undefined}
                    >
                        <button
                            type="submit"
                            disabled={isSaving || locked}
                            className="flex-1 sm:flex-none px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold tracking-wide transition-all shadow-md"
                        >
                            {isSaving ? "Saving..." : saved ? "Saved ✓" : "Save / Upsert Part"}
                        </button>
                    </div>
                </div>
            </form>

            {/* Enlarged Image Preview Overlay Modal */}
            {enlargedImageSrc && (
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
                </div>
            )}

            {/* Multiple Linked BOMs Selection Modal */}
            {isBomModalOpen && createPortal(
                <div 
                    className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
                    onClick={() => setIsBomModalOpen(false)}
                >
                    <div 
                        className={`w-full max-w-lg border rounded-2xl p-6 shadow-2xl space-y-4 ${containerBg}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b pb-3 border-zinc-800">
                            <h3 className="text-lg font-bold">Linked BOMs for Part</h3>
                            <button
                                type="button"
                                onClick={() => setIsBomModalOpen(false)}
                                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold"
                            >
                                ✕ Close
                            </button>
                        </div>
                        <p className={`text-xs ${isLight ? "text-zinc-600" : "text-zinc-400"}`}>
                            This part is used in multiple assemblies. Select a BOM below to view its details:
                        </p>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {linkedBoms.map((bom) => (
                                <div
                                    key={bom.id}
                                    onClick={() => {
                                        setIsBomModalOpen(false);
                                        navigate(`/bom/${bom.id}`);
                                    }}
                                    className={`p-3 border rounded-xl cursor-pointer transition-colors flex items-center justify-between ${isLight ? "bg-zinc-50 hover:bg-zinc-100 border-zinc-200" : "bg-zinc-950 hover:bg-zinc-800 border-zinc-800"}`}
                                >
                                    <div>
                                        <p className="font-semibold text-sm">{bom.name || "Unnamed Assembly"}</p>
                                        <p className={`text-xs ${isLight ? "text-zinc-500" : "text-zinc-400 font-mono"}`}>Catalog No: {bom.catalogNumber || "N/A"}</p>
                                    </div>
                                    <span className="text-xs font-bold text-blue-500">View BOM ↗</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default PartPortal;