/**
 * "Previous / next problem": moves to the red cell (Table's .cell-problem)
 * before or after the one that has the focus, in the table's row order, and
 * focuses its input so its problem shows. Wraps around at the ends. Only
 * cells on screen count (not the insides of collapsed assemblies).
 */
/** The problem cell moved to last: clicking ‹ › moves the focus to the button. */
let lastCell: HTMLElement | null = null;

export function goToProblemCell(direction: 1 | -1, within: ParentNode = document): boolean {
  const cells = Array.from(within.querySelectorAll<HTMLElement>(".cell-problem"));
  if (cells.length === 0) return false;
  const focused = document.activeElement;
  let current = focused ? cells.findIndex((c) => c === focused || c.contains(focused)) : -1;
  if (current === -1 && lastCell) current = cells.indexOf(lastCell);
  let index: number;
  if (current !== -1) {
    index = (current + direction + cells.length) % cells.length;
  } else if (focused && focused !== document.body) {
    // Focus is elsewhere in the table: the first problem after (or before) it.
    const after = cells.findIndex((c) => !!(focused.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING));
    index = direction === 1 ? (after === -1 ? 0 : after) : (after === -1 ? cells.length - 1 : (after - 1 + cells.length) % cells.length);
  } else {
    index = direction === 1 ? 0 : cells.length - 1;
  }
  const cell = cells[index];
  lastCell = cell;
  cell.scrollIntoView({ block: "center", inline: "nearest" });
  const target = cell.querySelector<HTMLElement>("input:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex]") ?? cell;
  if (target === cell && !cell.hasAttribute("tabindex")) cell.tabIndex = -1; // focusable, for its problem text
  target.focus({ preventScroll: true });
  return true;
}
