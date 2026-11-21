import { showToast } from "./toast";

/** Copies `text` and confirms it with a short toast (`what` names it: "catalog number", "link"). */
export async function copyToClipboard(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`Copied ${what}: ${text}`, "success");
  } catch {
    showToast(`Couldn't copy the ${what}. Select it and press Ctrl+C.`, "error");
  }
}

/** The website address that opens a part's Part Portal (Search Parts, ?part=<record id>). */
export function partLink(partId: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/partSearch?part=${encodeURIComponent(partId)}`;
}
