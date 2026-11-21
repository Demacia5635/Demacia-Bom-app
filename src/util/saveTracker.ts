/**
 * Which edits are on their way to the server, for the "Saving… / Saved ✓ /
 * Not saved" indicator (components/SaveStatus) and the leave-page warning
 * (components/useUnsavedEditsGuard). Each edit has a key ("part:<id>",
 * "row:<id>", "cnc:<groupId>"): pending from the edit (waiting on its timer
 * or in flight) until its save ends; failed until a later save of it works.
 */

export type SaveState = "idle" | "saving" | "saved" | "error";

const SAVED_SHOWN_MS = 3000;
const pending = new Set<string>();
const failed = new Set<string>();
let lastSavedAt = 0;
let state: SaveState = "idle";
const listeners = new Set<() => void>();
let savedTimer: ReturnType<typeof setTimeout> | undefined;

function update() {
  const next: SaveState =
    pending.size > 0 ? "saving" : failed.size > 0 ? "error" : Date.now() - lastSavedAt < SAVED_SHOWN_MS ? "saved" : "idle";
  if (next === state) return;
  state = next;
  for (const l of listeners) l();
}

/** An edit is waiting to be saved (or being saved). */
export function trackSaveStart(key: string): void {
  pending.add(key);
  update();
}

/** An edit's save ended. */
export function trackSaveEnd(key: string, ok: boolean): void {
  pending.delete(key);
  if (ok) {
    failed.delete(key);
    lastSavedAt = Date.now();
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(update, SAVED_SHOWN_MS);
  } else {
    failed.add(key);
  }
  update();
}

/** Leaving a page: its failed edits no longer count (pending ones still finish). */
export function clearFailedSaves(): void {
  failed.clear();
  update();
}

/** Edits not on the server yet: waiting, in flight, or failed. */
export const hasUnsavedEdits = (): boolean => pending.size > 0 || failed.size > 0;

export const currentSaveState = (): SaveState => state;

export function subscribeSaveState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
