import { useEffect, useSyncExternalStore } from "react";
import { clearFailedSaves, currentSaveState, subscribeSaveState } from "../util/saveTracker";

const SHOWN = {
  saving: { text: "Saving…", className: "text-zinc-500" },
  saved: { text: "Saved ✓", className: "text-emerald-600" },
  error: { text: "Not saved", className: "text-red-500 font-semibold" },
} as const;

/**
 * "Saving… / Saved ✓ / Not saved" for the page's edits (util/saveTracker.ts),
 * next to its table. The red error box above says what failed.
 */
export default function SaveStatus() {
  const state = useSyncExternalStore(subscribeSaveState, currentSaveState);
  // A page's failed edits are its own: forget them when it closes.
  useEffect(() => clearFailedSaves, []);
  if (state === "idle") return <span className="text-xs" aria-live="polite" />;
  const shown = SHOWN[state];
  return (
    <span className={`text-xs ${shown.className}`} role="status" aria-live="polite">
      {shown.text}
    </span>
  );
}
