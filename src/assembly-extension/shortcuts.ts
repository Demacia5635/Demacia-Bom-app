/**
 * The panel's keyboard shortcuts: one list, used by the key handler, the
 * buttons' tooltips and the "?" help.
 */
export const SHORTCUTS = {
  search: "Ctrl+F",
  publish: "Ctrl+Enter",
  refresh: "Alt+R",
  closeDialog: "Esc",
  help: "?",
  undo: "Ctrl+Z",
  redo: "Ctrl+Y",
} as const;

/** The toolbar's search box (focused by Ctrl+F). */
export const SEARCH_INPUT_ID = "bom-search-input";

/** Shown in the "?" help, in this order. */
export const SHORTCUT_HELP: { keys: string; what: string }[] = [
  { keys: SHORTCUTS.search, what: "Search the BOM" },
  { keys: SHORTCUTS.refresh, what: "Refresh BOM (asks first when there are unpublished edits)" },
  { keys: SHORTCUTS.publish, what: "Publish BOM (in the dialog: publish)" },
  { keys: "Drag / Shift+click", what: "Select cells (several rows: a bar to set Material, Engineer, STL, Parasolid on all)" },
  { keys: "Ctrl+C / Ctrl+V", what: "Copy / paste selected cells (to and from Excel)" },
  { keys: "Ctrl+D", what: "Fill down from the selection's top row" },
  { keys: "Delete", what: "Clear the selected text cells" },
  { keys: SHORTCUTS.undo, what: "Undo the last table edit (outside a cell's text box)" },
  { keys: SHORTCUTS.redo, what: "Redo (also Ctrl+Shift+Z)" },
  { keys: SHORTCUTS.closeDialog, what: "Close a dialog; in the search box, clear it" },
  { keys: SHORTCUTS.help, what: "Show this list" },
];

/** True when the key goes to a text field (so "?" types a "?"). */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && (el as HTMLInputElement).type !== "checkbox");
}
