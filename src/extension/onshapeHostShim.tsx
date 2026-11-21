/**
 * Where the BOM page gets its Onshape context from in the Chrome extension.
 *
 *  - useOnshapeContext(): built from the active tab's URL (OnshapeLocationProvider.tsx).
 *  - useOnshapeClient().showMessageBubble(): a side-panel toast.
 *
 * (The page used to run inside an Onshape tab, where both came from Onshape's
 * iframe messaging. That app is retired; these names are kept so the page
 * reads the same.)
 */
import { createContext, useContext, useMemo } from "react";
import type { OnshapeLocation } from "./onshapeTab";
import { showToast } from "./panel/toastStore";

/** The Onshape document/element the panel is showing. */
export interface OnshapeContext {
  documentId: string | null;
  /** Set when the document is open to a workspace. Mutually exclusive with versionId. */
  workspaceId: string | null;
  /** Set when the document is open to a version. Mutually exclusive with workspaceId. */
  versionId: string | null;
  microversionId: string | null;
  elementId: string | null;
  /** Origin of the Onshape tab, e.g. "https://cad.onshape.com". */
  server: string | null;
  configuration: string | null;
}

export interface OnshapeClient {
  context: OnshapeContext;
  /** Shows a short message to the user (a toast in the side panel). */
  showMessageBubble(message: string): void;
}

/** Provided by OnshapeLocationProvider.tsx. */
export const LocationContext = createContext<OnshapeLocation | null>(null);

export function useOnshapeContext(): OnshapeContext {
  const loc = useContext(LocationContext);
  return useMemo<OnshapeContext>(
    () => ({
      documentId: loc?.documentId ?? null,
      workspaceId: loc?.wvmType === "w" ? loc.wvmId : null,
      versionId: loc?.wvmType === "v" ? loc.wvmId : null,
      microversionId: loc?.wvmType === "m" ? loc.wvmId : null,
      elementId: loc?.elementId ?? null,
      server: loc?.server ?? null,
      configuration: loc?.configuration ?? null,
    }),
    [loc]
  );
}

export function useOnshapeClient(options: { context?: OnshapeContext } = {}): OnshapeClient {
  const urlContext = useOnshapeContext();
  const context = options.context ?? urlContext;
  return useMemo(() => ({ context, showMessageBubble: showToast }), [context]);
}
