import { useEffect, useRef, type KeyboardEvent } from "react";

/** Typing in a field, a select or editable text: "/" is a character there, not the shortcut. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/**
 * A page's search box shortcuts: "/" anywhere on the page jumps to it, and
 * Esc in it clears it. Put `inputRef` and `onKeyDown` on the input.
 */
export function useSearchShortcut(onClear: () => void) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (!inputRef.current) return;
      e.preventDefault();
      inputRef.current.focus();
      inputRef.current.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      onClear();
      e.currentTarget.blur();
    }
  };

  return { inputRef, onKeyDown };
}
