/**
 * Extension build replacement for src/util/OnshapeExtension.tsx.
 *
 * vite.extension.config.ts aliases AssemblyBomPage's
 * `import { useOnshapeClient, useOnshapeContext } from "../util/OnshapeExtension"`
 * to this file, so the page runs unchanged in the side panel:
 *  - useOnshapeContext(): built from the active tab's URL (OnshapeLocationProvider)
 *    instead of the iframe query string Onshape used to pass in.
 *  - useOnshapeClient().showMessageBubble(): a side-panel toast instead of
 *    Onshape's blue bubble (there's no parent Onshape frame to message).
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { OnshapeClient, OnshapeContext } from "../util/OnshapeExtension";
import type { OnshapeLocation } from "./onshapeTab";
import { showToast } from "./panel/toast";

const LocationContext = createContext<OnshapeLocation | null>(null);

export function OnshapeLocationProvider({
  location,
  children,
}: {
  location: OnshapeLocation | null;
  children: ReactNode;
}) {
  return <LocationContext.Provider value={location}>{children}</LocationContext.Provider>;
}

const EMPTY: Omit<OnshapeContext, "documentId" | "workspaceId" | "versionId" | "microversionId" | "elementId" | "tabElementId" | "server" | "configuration"> = {
  companyId: null,
  userId: null,
  locale: null,
  clientId: null,
  partId: null,
  partNumber: null,
  revision: null,
  featureId: null,
  nodeId: null,
  occurrencePath: null,
};

export function useOnshapeContext(): OnshapeContext {
  const loc = useContext(LocationContext);
  return useMemo<OnshapeContext>(
    () => ({
      ...EMPTY,
      documentId: loc?.documentId ?? null,
      workspaceId: loc?.wvmType === "w" ? loc.wvmId : null,
      versionId: loc?.wvmType === "v" ? loc.wvmId : null,
      microversionId: loc?.wvmType === "m" ? loc.wvmId : null,
      elementId: loc?.elementId ?? null,
      tabElementId: loc?.elementId ?? null,
      server: loc?.server ?? null,
      configuration: loc?.configuration ?? null,
    }),
    [loc]
  );
}

/** Only the parts AssemblyBomPage uses. */
export function useOnshapeClient(
  options: { context?: OnshapeContext } = {}
): Pick<OnshapeClient, "context" | "showMessageBubble"> {
  const urlContext = useOnshapeContext();
  const context = options.context ?? urlContext;
  return useMemo(() => ({ context, showMessageBubble: showToast }), [context]);
}
