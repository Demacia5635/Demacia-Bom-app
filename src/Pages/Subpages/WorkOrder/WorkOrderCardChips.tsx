import WorkOrderColumns from "./WorkOrderColumns";
import { valueColour } from "./workOrderOptions";
import { useThemeSync } from "../../../util/misc/useThemeSync";
import type WorkOrderTableRow from "./WorkOrderTableRow";

/** Chip colours for the table's value colours (css/table.css colours table cells only). */
const TONES: Record<string, [light: string, dark: string]> = {
  "status-bg-orange": ["bg-orange-100 text-orange-800 border-orange-300", "bg-orange-500/30 text-orange-200 border-orange-500/60"],
  "status-bg-blue": ["bg-blue-100 text-blue-800 border-blue-300", "bg-blue-500/30 text-blue-200 border-blue-500/60"],
  "status-bg-green": ["bg-green-100 text-green-800 border-green-300", "bg-green-600/30 text-green-200 border-green-500/60"],
  "status-bg-red": ["bg-red-100 text-red-800 border-red-300", "bg-red-500/30 text-red-200 border-red-500/60"],
};
const PLAIN: [string, string] = ["bg-zinc-100 text-zinc-800 border-zinc-300", "bg-zinc-800 text-zinc-200 border-zinc-600"];

const STATUS = WorkOrderColumns.find((c) => c.key === "statusCode")!;
const PRIORITY = WorkOrderColumns.find((c) => c.key === "Priority")!;

/**
 * A work-order card's Status and Priority (phones), as coloured chips that
 * are the table's dropdowns: same choices (a bought item's own status list),
 * and the change goes through the table's save (`onChange`).
 */
export default function WorkOrderCardChips({ row, onChange }: { row: WorkOrderTableRow; onChange: (changes: Partial<WorkOrderTableRow>) => void }) {
  const { isLight } = useThemeSync();
  const chip = (label: string, field: "statusCode" | "Priority", options: string[]) => {
    const value = String(row[field] ?? "");
    const choices = value && !options.includes(value) ? [value, ...options] : options;
    return (
      <label className="flex items-center gap-1.5 min-w-0">
        <span className="text-[10px] uppercase opacity-60 shrink-0">{label}</span>
        <select
          value={value}
          onChange={(e) => onChange({ [field]: e.target.value })}
          className={`min-w-0 max-w-full rounded-full border px-2.5 py-1 text-xs font-semibold ${(TONES[valueColour(value) ?? ""] ?? PLAIN)[isLight ? 0 : 1]}`}
        >
          {!value && <option value="">—</option>}
          {choices.map((o) => (
            <option key={o} value={o} className="text-black">
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {chip("Status", "statusCode", STATUS.rowOptions?.(row) ?? STATUS.options ?? [])}
      {chip("Priority", "Priority", PRIORITY.options ?? [])}
    </div>
  );
}
