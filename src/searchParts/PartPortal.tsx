import React, { useState, useEffect, type ChangeEvent, type FormEvent } from "react";
import { AuthenticatedImage, downloadFile } from "../util/ApiService";
import { useThemeSync } from "../util/misc/useThemeSync";
import type { PartModel } from "../util/Models";

const PartPortal: React.FC<{ part: PartModel }> = ({ part }) => {
    const { isLight } = useThemeSync();
    const [formData, setFormData] = useState<PartModel>({ ...part });
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null);

    useEffect(() => {
        setFormData({ ...part });
    }, [part]);

    const handleChange = (
        e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value, type } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === "number" ? (value === "" ? undefined : Number(value)) : value,
        }));
    };

    const handleUpsert = async (e: FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setSaveError(null);

        try {
            const response = await fetch(`${import.meta.env.VITE_CLIENT_URL}/api/db/part/id/${part.id}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-client-secret": import.meta.env.VITE_CLIENT_SECRET,
                },
                body: JSON.stringify(formData),
            });

            if (!response.ok) {
                throw new Error(`Failed to save part data (${response.status})`);
            }

            await response.json().catch(() => formData);
        } catch (err: any) {
            setSaveError(err.message || "An unexpected error occurred while saving.");
        } finally {
            setIsSaving(false);
        }
    };

    const avatarUrl = formData.avatarID ? `/drive/file/id/${formData.avatarID}` : "";

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
    const secondaryBtnClass = isLight ? "bg-zinc-200 hover:bg-zinc-300 text-zinc-800" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200";

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
                                disabled={part.vendor !== ""}
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
                            disabled={part.vendor !== ""}
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
                            disabled={part.vendor !== ""}
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
                            disabled={part.vendor !== ""}
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
                            disabled={part.vendor !== ""}
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
                            disabled={part.vendor !== ""}
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
                            disabled={part.vendor !== ""}
                            onChange={handleChange}
                            placeholder="0.00"
                            className={`w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 ${subInputBg}`}
                        />
                    </div>
                </div>

                {/* Row 3: Links & Media Keys */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className={`border rounded-xl p-3.5 space-y-1.5 ${cardBg}`}>
                        <label className={`text-[10px] font-semibold uppercase tracking-wider block ${labelColor}`}>
                            Onshape CAD URL
                        </label>
                        <button
                            type="button"
                            onClick={() => {
                                if (part.onshapeURL) window.open(part.onshapeURL, "_blank");
                            }}
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
                            onClick={async () => {
                                const downloadUrl = `${import.meta.env.VITE_CLIENT_URL}/api/drive/file/${part.stlLink}`;
                                await downloadFile(downloadUrl, `${part.name || "part"}.stl`);
                            }}
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
                            onClick={async () => {
                                const downloadUrl = `${import.meta.env.VITE_CLIENT_URL}/api/drive/file/${part.parasolidLink}`;
                                await downloadFile(downloadUrl, `${part.name || "part"}.parasolid`);
                            }}
                            className="mx-auto px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Download Parasolid
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
                        disabled={part.vendor !== ""}
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
                        disabled={part.vendor !== ""}
                        placeholder="Additional manufacturing notes, comments, or issues..."
                        className={`w-full border rounded-lg p-3 text-xs placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-y ${subInputBg} ${commentsColor}`}
                    />
                </div>

                {/* Footer Actions */}
                <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t ${headerBorder}`}>
                    <div className="flex items-center gap-3">
                        {formData.onshapeURL && (
                            <a
                                href={formData.onshapeURL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${secondaryBtnClass}`}
                            >
                                Open CAD Link ↗
                            </a>
                        )}
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="flex-1 sm:flex-none px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold tracking-wide transition-all shadow-md"
                        >
                            {isSaving ? "Saving..." : "Save / Upsert Part"}
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
                    <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
                        <button
                            type="button"
                            onClick={() => setEnlargedImageSrc(null)}
                            className="absolute -top-10 right-0 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold"
                        >
                            ✕ Close
                        </button>
                        {enlargedImageSrc === "FAILED" ? (
                            <div className="w-96 h-96 bg-zinc-900 border border-zinc-700 rounded-xl flex flex-col items-center justify-center text-zinc-400 gap-2">
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
        </div>
    );
};

export default PartPortal;