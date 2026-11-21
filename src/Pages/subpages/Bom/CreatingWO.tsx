import { useState, type FormEvent, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useThemeSync } from "../../../util/misc/useThemeSync";
import { fetchFromApi } from "../../../util/ApiService";
import { collectBomParts } from "../../../util/bomParts";
import { fetchPartsByIds } from "../../../util/records";
import { isPurchasedPart, type BomModel, type PartModel, type WorkorderModel, type WorkorderPartModel } from "../../../util/Models";
import { checkCatalogTree, type CatalogNode } from "../../../util/catalogNumbers";

/**
 * A made part's manufacturing method from the files it keeps (the STL /
 * Parasolid ticks in the BOM extension): STL -> "Printed", Parasolid -> "CNC".
 * Both or neither: left to the default ("Manual") for a person to choose.
 * Parts saved before the ticks existed go by the files they have.
 */
function methodFromFiles(part: PartModel | null): string | undefined {
    if (!part) return undefined;
    const hasChoice = typeof part.wantStl === "boolean" || typeof part.wantParasolid === "boolean";
    const stl = hasChoice ? !!part.wantStl : !!part.stlLink;
    const parasolid = hasChoice ? !!part.wantParasolid : !!part.parasolidLink;
    if (stl && !parasolid) return "Printed";
    if (parasolid && !stl) return "CNC";
    return undefined;
}

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

    /**
     * Checks every catalog number in the assembly against the numbering rules
     * (util/catalogNumbers.ts, the same the BOM extension shows) and throws
     * listing the problems, if any.
     */
    async function checkCatalogNumbers(topBomId: string) {
        const names = new Map<string, string>();
        const seen = new Set<string>();
        async function load(bomId: string): Promise<CatalogNode> {
            const bom = await fetchFromApi<BomModel>(`/db/bom/id/${encodeURIComponent(bomId)}`);
            const partRecords = await fetchPartsByIds((bom.parts || []).map((p) => p.partID));
            const children: CatalogNode[] = [];
            for (const sub of bom.subAssemblies || []) {
                if (seen.has(sub.bomID)) continue; // a shared sub-assembly is checked once
                seen.add(sub.bomID);
                children.push(await load(sub.bomID));
            }
            for (const p of bom.parts || []) {
                const part = partRecords.get(p.partID) ?? null;
                const name = part?.name || p.partID;
                names.set(p.partID, name);
                children.push({ id: p.partID, name, number: part?.catalogNumber || "", isAssembly: false, exempt: isPurchasedPart(part), children: [] });
            }
            const name = bom.name || bom.id;
            names.set(bom.id, name);
            return {
                id: bom.id,
                name,
                number: bom.catalogNumber || "",
                isAssembly: true,
                exempt: bomId !== topBomId && (!!bom.markedStandard || !!bom.vendor?.trim()),
                children,
            };
        }

        const problems = checkCatalogTree(await load(topBomId));
        if (problems.length === 0) return;
        const shown = problems.slice(0, 5).map((p) => `• "${names.get(p.id) ?? p.id}": ${p.message}`);
        const more = problems.length > 5 ? `\n…and ${problems.length - 5} more.` : "";
        throw new Error(
            `Catalog numbers need fixing before a work order can be made (the BOM extension marks them in red):\n${shown.join("\n")}${more}`
        );
    }

    /**
     * One work-order line per part, with its total quantity for one top
     * assembly: each quantity multiplied by the quantities of the
     * sub-assemblies above it, and added up when a part (or a whole
     * sub-assembly) appears in several places. Same totals as the work-order
     * page (WorkOrderDetailsPage), which reads them the same way.
     */
    async function collectWorkOrderParts(targetBomId: string): Promise<WorkorderPartModel[]> {
        if (!targetBomId || targetBomId === "undefined") {
            throw new Error("Assembly ID is missing or undefined.");
        }
        const fetchBom = (id: string) => fetchFromApi<BomModel>(`/db/bom/id/${encodeURIComponent(id)}`);
        const totals = new Map<string, number>();
        for (const [partID, quantity] of await collectBomParts(fetchBom, targetBomId, 1)) {
            totals.set(partID, (totals.get(partID) || 0) + quantity);
        }

        // Every part in one request instead of one per part.
        const partRecords = await fetchPartsByIds([...totals.keys()]);

        const collectedParts: WorkorderPartModel[] = [];
        for (const [partID, quantityTotal] of totals) {
            const partRecord: PartModel | null = partRecords.get(partID) ?? null;

            const catalogNumber = partRecord?.catalogNumber || "";
            const material = partRecord?.material?.trim() || "";
            const engineer = partRecord?.engineer?.trim() || "";

            // Bought, not made (Onshape Standard Content such as screws, a part
            // with a vendor, or one marked standard in the extension): no catalog
            // number, material or engineer needed.
            const isPurchased = isPurchasedPart(partRecord);

            if (!isPurchased) {
                // Catalog numbers were checked for the whole tree first (checkCatalogNumbers).
                // Non-purchased parts need a material and an engineer.
                if (!material) {
                    throw new Error(`Missing material for manufactured part "${partRecord?.name || partID}" (Catalog: ${catalogNumber}).`);
                }
                if (!engineer) {
                    throw new Error(`Missing engineer for manufactured part "${partRecord?.name || partID}" (Catalog: ${catalogNumber}).`);
                }
            }

            const method = isPurchased ? "Purchased" : methodFromFiles(partRecord);
            collectedParts.push({
                partID,
                quantityTotal,
                quantityMade: 0,
                // Purchased parts aren't manufactured, so their progress isn't tracked.
                statusCode: isPurchased ? "Untracked" : 0,
                // Made parts: Printed / CNC from their STL / Parasolid tick.
                ...(method ? { manufacturingMethod: method } : {}),
                productionGCOwner: "",
                productionMakingOwner: "",
                updatedAt: new Date(),
                createdAt: new Date(),
            });
        }
        return collectedParts;
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const id = Date.now().toString();
            await checkCatalogNumbers(bomId);
            const parts = await collectWorkOrderParts(bomId);

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

            // Same server as every other request (localhost:5050 when run locally).
            await fetchFromApi(`/db/workOrder/id/${encodeURIComponent(id)}`, {
                method: "POST",
                body: JSON.stringify(payload),
            }).catch((err: any) => {
                throw new Error(`Failed to create the work order: ${err?.message || err}`);
            });

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
                <div className="p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-xs font-medium whitespace-pre-line max-h-60 overflow-y-auto">
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