import { useState, type FormEvent, type ChangeEvent } from "react";
import { useThemeSync } from "../util/misc/useThemeSync";

export interface WorkOrderFormData {
    name: string;
    workOrderOwner: string;
    description: string;
    comments: string;
}

interface WorkOrderFormProps {
    onCancel?: () => void;
    onSubmit?: (data: WorkOrderFormData) => void;
    initialData?: Partial<WorkOrderFormData>;
}

export function WorkOrderForm({ onCancel, onSubmit, initialData }: WorkOrderFormProps) {
    const { isLight } = useThemeSync();
    const [formData, setFormData] = useState<WorkOrderFormData>({
        name: initialData?.name || "",
        workOrderOwner: initialData?.workOrderOwner || "",
        description: initialData?.description || "",
        comments: initialData?.comments || "",
    });

    const handleChange = (
        e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (onSubmit) {
            onSubmit(formData);
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
                        className={`w-full font-semibold py-2.5 px-4 rounded-lg text-xs tracking-wide transition-all shadow-md focus:outline-none focus:ring-2 ${cancelBtnClass}`}
                    >
                        Cancel
                    </button>
                </div>
                <div className="pt-2">
                    <button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 px-4 rounded-lg text-xs tracking-wide transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                        Submit Work Order
                    </button>
                </div>
            </div>
        </form>
    );
}