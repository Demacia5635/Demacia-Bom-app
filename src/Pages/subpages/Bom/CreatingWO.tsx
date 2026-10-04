import { useState, type FormEvent, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useThemeSync } from "../../../util/misc/useThemeSync";
import { fetchFromApi } from "../../../util/ApiService";
import type { BomModel, PartModel, WorkorderModel, WorkorderPartModel } from "../../../util/Models";

export interface WorkOrderFormData {
    name: string;
    workOrderOwner: string;
    description: string;
    comments: string;
}

interface WorkOrderFormProps {
    bomId: string;
    avatarID?: string;
    onCancel?: () => void;
}

export function WorkOrderForm({ bomId, avatarID, onCancel }: WorkOrderFormProps) {
    const { isLight } = useThemeSync();
    const navigate = useNavigate();

    const [formData, setFormData] = useState<WorkOrderFormData>({
        name: "",
        workOrderOwner: "",
        description: "",
        comments: "",
    });
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleChange = (
        e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const visitedBoms = new Set<string>();

    async function fetchBomPartsRecursively(
        targetBomId: string,
        seenCatalogNumbers: Set<string>
    ): Promise<WorkorderPartModel[]> {
        if (!targetBomId || targetBomId === "undefined") {
            throw new Error("Assembly ID is missing or undefined.");
        }
        if (visitedBoms.has(targetBomId)) return [];
        visitedBoms.add(targetBomId);

        const currentBom = await fetchFromApi<BomModel>(`/db/bom/id/${targetBomId}`);
        const collectedParts: WorkorderPartModel[] = [];

        for (const sub of currentBom.subAssemblies || []) {
            const subParts = await fetchBomPartsRecursively(sub.bomID, seenCatalogNumbers);
            collectedParts.push(...subParts);
        }

        for (const p of currentBom.parts || []) {
            const partRecord = await fetchFromApi<PartModel>(`/db/part/id/${p.partID}`).catch(() => null);
            
            const catalogNumber = partRecord?.catalogNumber || "";
            const material = partRecord?.material?.trim() || "";
            const engineer = partRecord?.engineer?.trim() || "";
            
            // Check if it's an externally purchased part (has a vendor specified)
            const isPurchased = Boolean(partRecord?.vendor && partRecord.vendor.trim() !== "");

            if (!isPurchased) {
                // 1. Verify format AABB-CCDD (e.g., 2603-1001)
                const catalogRegex = /^\d{4}-\d{4}$/;
                if (!catalogRegex.test(catalogNumber)) {
                    throw new Error(`Invalid catalog number format for part "${partRecord?.name || p.partID}": "${catalogNumber}". Must match format AABB-CCDD (e.g., 2603-1001).`);
                }

                // 2. Check for duplicate catalog numbers
                if (seenCatalogNumbers.has(catalogNumber)) {
                    throw new Error(`Duplicate catalog number detected: "${catalogNumber}" appears more than once.`);
                }
                seenCatalogNumbers.add(catalogNumber);

                // 3. Ensure non-purchased parts have material and engineer defined
                if (!material) {
                    throw new Error(`Missing material for manufactured part "${partRecord?.name || p.partID}" (Catalog: ${catalogNumber}).`);
                }
                if (!engineer) {
                    throw new Error(`Missing engineer for manufactured part "${partRecord?.name || p.partID}" (Catalog: ${catalogNumber}).`);
                }
            }

            const workOrderPart: WorkorderPartModel = {
                partID: p.partID,
                quantityTotal: p.quantity,
                quantityMade: 0,
                statusCode: 0,
                productionGCOwner: "",
                productionMakingOwner: "",
                updatedAt: new Date(),
                createdAt: new Date(),
            };
            collectedParts.push(workOrderPart);
        }
        return collectedParts;
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const id = Date.now().toString();
            const seenCatalogNumbers = new Set<string>();
            const parts = await fetchBomPartsRecursively(bomId, seenCatalogNumbers);

            const payload: WorkorderModel = {
                id: id,
                name: formData.name.trim(),
                bomID: bomId,
                workOrderOwner: formData.workOrderOwner.trim(),
                description: formData.description.trim(),
                parts: parts,
                avatarID: avatarID,
                comments: formData.comments,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const secret: string = import.meta.env.VITE_CLIENT_SECRET;
            const response = await fetch(`${import.meta.env.VITE_CLIENT_URL || "https://demacia-bom-app-n2ag.onrender.com"}/api/db/workOrder/id/${id}`, {
                method: "POST",
                headers: {
                    "content-Type": "application/json",
                    "x-client-secret": secret,
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`Failed to create Work Order: ${response.statusText}`);
            }

            navigate(`/workOrder/${id}`);
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred during work order creation.");
        } finally {
            setLoading(false);
        }
    };

    // Dynamic theme classes
    const formBg = isLight ? "bg-white border-zinc-300 text-zinc-900 shadow-xl" : "bg-zinc-900 border-zinc-800 text-zinc-100 shadow-xl";
    const headingColor = isLight ? "text-zinc-900" : "text-white";
    const labelColor = isLight ? "text-zinc-600" : "text-zinc-400";
    const inputBg = isLight ? "bg-zinc-50 border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:ring-blue-600/50 focus:border-blue-600" : "bg-zinc-950 border-zinc-800 text-zinc-100 placeholder-zinc-600 focus:ring-blue-500/50 focus:border-blue-500";
    const cancelBtnClass = isLight ? "bg-zinc-300 hover:bg-zinc-400 text-zinc-800 focus:ring-zinc-400" : "bg-zinc-600 hover:bg-zinc-500 text-white focus:ring-zinc-400";

    return (
        <form
            onSubmit={handleSubmit}
            className={`max-w-xl mx-auto border rounded-2xl p-6 space-y-5 transition-colors duration-200 ${formBg}`}
        >
            <h2 className={`text-xl font-bold tracking-tight mb-4 ${headingColor}`}>
                Work Order Details
            </h2>

            {error && (
                <div className="p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-xs font-medium">
                    {error}
                </div>
            )}

            {/* Name and Work Order Owner in a single row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label
                        htmlFor="name"
                        className={`block text-xs font-semibold uppercase tracking-wider ${labelColor}`}
                    >
                        Name
                    </label>
                    <input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Enter work order name"
                        required
                        className={`w-full border rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:ring-2 transition-all ${inputBg}`}
                    />
                </div>

                <div className="space-y-1.5">
                    <label
                        htmlFor="workOrderOwner"
                        className={`block text-xs font-semibold uppercase tracking-wider ${labelColor}`}
                    >
                        Work Order Owner
                    </label>
                    <input
                        type="text"
                        id="workOrderOwner"
                        name="workOrderOwner"
                        value={formData.workOrderOwner}
                        onChange={handleChange}
                        placeholder="Enter owner name"
                        required
                        className={`w-full border rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:ring-2 transition-all ${inputBg}`}
                    />
                </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
                <label
                    htmlFor="description"
                    className={`block text-xs font-semibold uppercase tracking-wider ${labelColor}`}
                >
                    Description
                </label>
                <textarea
                    id="description"
                    name="description"
                    rows={2}
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Provide a detailed description"
                    className={`w-full border rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:ring-2 transition-all resize-none ${inputBg}`}
                />
            </div>

            {/* Comments */}
            <div className="space-y-1.5">
                <label
                    htmlFor="comments"
                    className={`block text-xs font-semibold uppercase tracking-wider ${labelColor}`}
                >
                    Comments
                </label>
                <textarea
                    id="comments"
                    name="comments"
                    rows={3}
                    value={formData.comments}
                    onChange={handleChange}
                    placeholder="Add any extra notes or comments"
                    className={`w-full border rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:ring-2 transition-all resize-none ${inputBg}`}
                />
            </div>

            {/* Submit Action */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="pt-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={loading}
                        className={`w-full font-semibold py-2.5 px-4 rounded-lg text-xs tracking-wide transition-all shadow-md focus:outline-none focus:ring-2 ${cancelBtnClass}`}
                    >
                        Cancel
                    </button>
                </div>
                <div className="pt-2">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded-lg text-xs tracking-wide transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                        {loading ? "Validating Parts..." : "Submit Work Order"}
                    </button>
                </div>
            </div>
        </form>
    );
}