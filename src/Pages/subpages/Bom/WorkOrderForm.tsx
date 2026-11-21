import { useState, type FormEvent, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useThemeSync } from "../../../util/misc/useThemeSync";
import { fetchFromApi } from "../../../util/ApiService";
import { catalogTree, loadBomTree, workOrderLines, type BomTree } from "../../../util/bomTree";
import { isPurchasedPart, type PartModel, type WorkOrderModel, type WorkOrderPartModel } from "../../../util/Models";
import { checkCatalogTree } from "../../../util/catalogNumbers";
import ErrorBanner from "../../../components/ErrorBanner";
import { useThemeClasses } from "../../../util/misc/useThemeClasses";

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
    /** Told when creating starts and ends, so the dialog around it can't be closed meanwhile. */
    onBusyChange?: (busy: boolean) => void;
}

export function WorkOrderForm({ bomId, avatarID, onCancel, onBusyChange }: WorkOrderFormProps) {
    const { isLight } = useThemeSync();
    const theme = useThemeClasses();
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
    function checkCatalogNumbers(tree: BomTree) {
        const { root, names } = catalogTree(tree);
        const problems = checkCatalogTree(root);
        if (problems.length === 0) return;
        const shown = problems.slice(0, 5).map((p) => `• "${names.get(p.id) ?? p.id}": ${p.message}`);
        const more = problems.length > 5 ? `\n…and ${problems.length - 5} more.` : "";
        throw new Error(
            `Catalog numbers need fixing before a work order can be made (the BOM extension marks them in red):\n${shown.join("\n")}${more}`
        );
    }

    /**
     * One work-order line per part under the assembly (a part used in several
     * places once), the same parts the work-order page lists (both use
     * workOrderLines, util/bomTree.ts). A bought sub-assembly is one purchased line,
     * without the parts inside it. Quantities aren't stored: the page shows the
     * BOM's current totals.
     */
    function collectWorkOrderParts(tree: BomTree): WorkOrderPartModel[] {
        const { totals, bought: boughtAssemblies } = workOrderLines(tree);

        const collectedParts: WorkOrderPartModel[] = [];
        for (const partID of totals.keys()) {
            // Every part listed in a BOM is in the tree (a bought sub-assembly
            // needs no record: it's purchased).
            const partRecord: PartModel | null = tree.parts.get(partID) ?? null;

            const catalogNumber = partRecord?.catalogNumber || "";
            const material = partRecord?.material?.trim() || "";
            const engineer = partRecord?.engineer?.trim() || "";

            // Bought, not made (Onshape Standard Content such as screws, a part
            // with a vendor, one marked standard in the extension, or a bought
            // sub-assembly): no catalog number, material or engineer needed.
            const isPurchased = boughtAssemblies.has(partID) || isPurchasedPart(partRecord);

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
                // No quantities: a work order follows its live BOM, and the
                // work-order page always shows the BOM's current totals.
                // Purchased parts aren't manufactured, so their progress isn't tracked.
                statusCode: isPurchased ? "Untracked" : 0,
                // Made parts: Printed / CNC from their STL / Parasolid tick.
                ...(method ? { manufacturingMethod: method } : {}),
                productionGCOwner: "",
                productionMakingOwner: "",
                updatedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
            });
        }
        return collectedParts;
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        onBusyChange?.(true);

        try {
            // Random, so two work orders made at the same moment can't collide. Older
            // work orders keep their Date.now() ids (and addresses).
            const id = crypto.randomUUID();
            if (!bomId || bomId === "undefined") {
                throw new Error("Assembly ID is missing or undefined.");
            }
            // The whole assembly once (util/bomTree.ts), for both steps below.
            const tree = await loadBomTree(bomId);
            checkCatalogNumbers(tree);
            const parts = collectWorkOrderParts(tree);

            const payload: WorkOrderModel = {
                id: id,
                name: formData.name.trim(),
                bomID: bomId,
                workOrderOwner: formData.workOrderOwner.trim(),
                description: formData.description.trim(),
                parts: parts,
                avatarID: avatarID,
                comments: formData.comments,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
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
            onBusyChange?.(false);
        }
    };

    // Dynamic theme classes
    const formBg = isLight ? "bg-white border-zinc-300 text-zinc-900 shadow-xl" : "bg-zinc-900 border-zinc-800 text-zinc-100 shadow-xl";
    const inputBg = isLight ? "bg-zinc-50 border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:ring-blue-600/50 focus:border-blue-600" : "bg-zinc-950 border-zinc-800 text-zinc-100 placeholder-zinc-600 focus:ring-blue-500/50 focus:border-blue-500";
    const cancelBtnClass = isLight ? "bg-zinc-300 hover:bg-zinc-400 text-zinc-800 focus:ring-zinc-400" : "bg-zinc-600 hover:bg-zinc-500 text-white focus:ring-zinc-400";

    return (
        <form
            onSubmit={handleSubmit}
            className={`max-w-xl mx-auto border rounded-2xl p-6 space-y-5 transition-colors duration-200 ${formBg}`}
        >
            <h2 className={`text-xl font-bold tracking-tight mb-4 ${theme.textHeading}`}>
                Work Order Details
            </h2>

            {error && (
                <ErrorBanner className="p-3 rounded-lg text-xs font-medium whitespace-pre-line max-h-60 overflow-y-auto">
                    {error}
                </ErrorBanner>
            )}

            {/* Name and Work Order Owner in a single row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label
                        htmlFor="name"
                        className={`block text-xs font-semibold uppercase tracking-wider ${theme.textLabel}`}
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
                        className={`block text-xs font-semibold uppercase tracking-wider ${theme.textLabel}`}
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
                    className={`block text-xs font-semibold uppercase tracking-wider ${theme.textLabel}`}
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
                    className={`block text-xs font-semibold uppercase tracking-wider ${theme.textLabel}`}
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