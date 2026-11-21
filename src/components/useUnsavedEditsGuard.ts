import { useEffect } from "react";
import { hasUnsavedEdits } from "../util/saveTracker";

/** The question before leaving the page in the app (a sidebar link) with unsaved edits. */
export const LEAVE_WITH_UNSAVED_EDITS = "Some edits aren't saved yet. Leave this page anyway?";

/**
 * While an edit is waiting to be saved, being saved or failed
 * (util/saveTracker.ts), closing or reloading the tab asks first (the
 * browser's own "Leave site?" question). Mounted once, in MainLayout.
 */
export function useUnsavedEditsGuard() {
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedEdits()) return;
      e.preventDefault();
      e.returnValue = ""; // older browsers need it to ask
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
}
