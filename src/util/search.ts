/**
 * Text search for the lists: case doesn't matter, and any run of spaces in
 * the query matches any run of spaces in the text ("m4  bolt" finds "M4 Bolt").
 * The same pattern finds the matched text to highlight (components/Highlight).
 */

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The query as a pattern, or null when it's empty. */
export function searchPattern(query: string): RegExp | null {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return new RegExp(words.map(escapeRegExp).join("\\s+"), "i");
}

/** Whether any of the fields contains the query (true for an empty query). */
export function matchesSearch(pattern: RegExp | null, fields: (string | number | null | undefined)[]): boolean {
  if (!pattern) return true;
  return fields.some((field) => field != null && pattern.test(String(field)));
}
