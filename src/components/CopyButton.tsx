import { Copy } from "lucide-react";
import type { MouseEvent } from "react";
import { copyToClipboard } from "../util/clipboard";

/**
 * A small copy icon. With `onHover`, it shows only while the pointer is over
 * the nearest parent with the `group` class (or when focused by keyboard).
 */
export default function CopyButton({ text, what, onHover = true, className = "" }: {
  text: string;
  /** What's copied, for the label and the "Copied" note: "catalog number". */
  what: string;
  onHover?: boolean;
  className?: string;
}) {
  if (!text) return null;
  const copy = (e: MouseEvent) => {
    // Inside clickable cards and rows: copying doesn't also open them.
    e.stopPropagation();
    e.preventDefault();
    void copyToClipboard(text, what);
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${what}`}
      title={`Copy ${what}`}
      className={`inline-flex items-center justify-center align-middle ml-1 p-0.5 rounded hover:bg-zinc-500/20 transition-opacity ${onHover ? "opacity-0 group-hover:opacity-100 focus-visible:opacity-100" : "opacity-60 hover:opacity-100"} ${className}`}
    >
      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
  );
}

/** A catalog number with its copy icon ("N/A" when empty, nothing to copy then). */
export function CatalogNumber({ value, onHover = true }: { value: string | undefined; onHover?: boolean }) {
  return (
    <span className="group inline-flex items-center">
      {value || "N/A"}
      {value && <CopyButton text={value} what="catalog number" onHover={onHover} />}
    </span>
  );
}
