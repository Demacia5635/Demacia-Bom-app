import type { ReactNode } from "react";
import { AuthenticatedImage } from "./AuthenticatedImage";
import { useThemeClasses } from "../util/misc/useThemeClasses";

export interface RecordCardItem {
  id: string;
  image: string;
  name: string;
  catalogNumber?: string;
  quantity?: number;
  /** A small note after the name ("Sub-assembly", "Bought"). */
  tag?: string;
}

/**
 * The phone layout of the BOM / work-order parts (usePhoneCards): one card per
 * part with its image, name, catalog number and quantity. Tapping a card calls
 * `onOpen` (Part Portal); `extra` adds controls under it (they don't open it).
 */
export default function RecordCardList<Row>({ rows, item, onOpen, extra, empty = "No parts to show." }: {
  rows: Row[];
  item: (row: Row) => RecordCardItem;
  onOpen: (row: Row) => void;
  extra?: (row: Row) => ReactNode;
  empty?: string;
}) {
  const theme = useThemeClasses();
  if (rows.length === 0) return <p className={`py-6 text-center text-sm ${theme.textMuted}`}>{empty}</p>;
  return (
    <ul className="space-y-2" aria-label="Parts">
      {rows.map((row, index) => {
        const it = item(row);
        const more = extra?.(row);
        return (
          <li key={`${it.id}-${index}`} data-row-id={it.id} className={`border rounded-xl ${theme.cardWithText}`}>
            <button type="button" onClick={() => onOpen(row)} className="w-full flex items-center gap-3 p-3 text-left">
              <span className={`w-14 h-14 shrink-0 rounded-lg overflow-hidden border flex items-center justify-center text-[10px] ${theme.imageBox}`}>
                {it.image ? <AuthenticatedImage src={it.image} alt="" className="w-full h-full object-cover" /> : <span className={theme.textMuted}>No image</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold break-words leading-snug">{it.name || "(no name)"}</span>
                <span className={`block text-xs ${theme.textMuted}`}>
                  {it.catalogNumber && <span className="font-mono">{it.catalogNumber}</span>}
                  {it.catalogNumber && it.tag && " · "}
                  {it.tag}
                </span>
              </span>
              {it.quantity != null && (
                <span className="shrink-0 text-right">
                  <span className="block text-lg font-bold tabular-nums leading-none">×{it.quantity}</span>
                  <span className={`block text-[10px] uppercase ${theme.textMuted}`}>qty</span>
                </span>
              )}
            </button>
            {more && <div className="px-3 pb-3 -mt-1">{more}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/** "Table view" / "Card view" switch shown on phones above the parts. */
export function CardViewToggle({ tableView, onChange }: { tableView: boolean; onChange: (tableView: boolean) => void }) {
  const theme = useThemeClasses();
  return (
    <button
      type="button"
      onClick={() => onChange(!tableView)}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${theme.border} ${theme.textValue} hover:bg-zinc-500/10`}
    >
      {tableView ? "Card view" : "Table view"}
    </button>
  );
}
