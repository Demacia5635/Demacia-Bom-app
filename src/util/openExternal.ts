/**
 * Opens a link (usually an Onshape URL from the database) in a new tab.
 * - noopener/noreferrer: the opened page gets no handle back to this one.
 * - Only http(s): a stored "javascript:" or "data:" URL is never run.
 * Returns false when the URL was refused.
 */
export function openExternal(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  window.open(parsed.href, "_blank", "noopener,noreferrer");
  return true;
}
