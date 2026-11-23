/**
 * The work order's parts as plain text for a message (WhatsApp, a supplier):
 * a header line (work order name and date), then one line per part:
 * "5635-25-100 – Bracket ×4".
 *
 * Names can be Hebrew: invisible left-to-right marks (U+200E) around the
 * catalog number and the quantity keep each line in that order when the
 * message is shown right-to-left.
 */
const LRM = "‎";

export interface PartListLine {
  catalogNumber?: string;
  name?: string;
  quantity?: number;
}

export function partListLine({ catalogNumber, name, quantity }: PartListLine): string {
  const parts: string[] = [];
  const catalog = catalogNumber?.trim();
  if (catalog) parts.push(`${LRM}${catalog}${LRM}`);
  parts.push(name?.trim() || "(no name)");
  const line = parts.join(" – ");
  return quantity ? `${line} ${LRM}×${quantity}${LRM}` : line;
}

/** The date as the team writes it (Israel time), e.g. "23/11/2026". */
export function listDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { timeZone: "Asia/Jerusalem" });
}

export function partListText(title: string, rows: PartListLine[], date: Date = new Date()): string {
  return [`${title} – ${listDate(date)}`, ...rows.map(partListLine)].join("\n");
}
