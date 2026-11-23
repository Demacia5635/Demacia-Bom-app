/**
 * Side panel root: checks the browser is signed in to Onshape, then shows the
 * BOM of the assembly in the tab this panel was opened for (one panel per tab;
 * see background.ts). There are no Demacia accounts; every
 * Onshape call uses the browser's Onshape session.
 */
import { type ReactNode } from "react";
import AssemblyBomPage from "../../assembly-extension/AssemblyBomPage";
import OnshapeLocationProvider from "../OnshapeLocationProvider";
import { setOnshapeServer } from "../onshapeDirect";
import { useOwnOnshapeTab, type OnshapeLocation } from "../onshapeTab";
import OnshapeSignInCheck from "./OnshapeSignInCheck";
import TelemetryConsentPrompt from "./TelemetryConsentPrompt";
import { Toasts } from "./toast";
import { setOnshapeImageCache, setOnshapeImageListener } from "../../util/ApiService";
import { recordOnshapeCall } from "../telemetry";
import { getCachedImage, putCachedImage } from "../imageCache";
import { PanelThemeContext, usePanelTheme } from "./theme";

// Table images load straight from Onshape; count them for the footprint page (/tele).
setOnshapeImageListener((url, ok) => recordOnshapeCall("GET", url, ok));
// ...and are kept until their model changes, so reopening doesn't render them again.
setOnshapeImageCache({ get: getCachedImage, put: putCachedImage });

function Message({ children }: { children: ReactNode }) {
  return (
    <div className="p-4">
      <h1 className="text-base font-bold mb-3">Demacia BOM</h1>
      <p className="text-sm text-zinc-500">{children}</p>
    </div>
  );
}

/** The BOM page for this panel's tab, or a hint when the tab isn't an Onshape element. */
function BomForActiveTab({ loading, location }: { loading: boolean; location: OnshapeLocation | null }) {
  if (loading) return <Message>Reading this tab...</Message>;
  if (!location) return <Message>Open an Onshape assembly in this tab to see its bill of materials.</Message>;
  // Remount per element so each assembly starts from a clean state.
  return <AssemblyBomPage key={`${location.documentId}/${location.wvmType}/${location.wvmId}/${location.elementId}`} />;
}

export default function PanelApp() {
  const { loading, location } = useOwnOnshapeTab();
  const theme = usePanelTheme();

  // Direct Onshape calls go to whichever Onshape server this tab is on.
  // Set during render (idempotent) rather than in an effect: child effects,
  // like the sign-in check, run before the parent's.
  if (location) setOnshapeServer(location.server);

  return (
    <PanelThemeContext.Provider value={theme}>
    <OnshapeLocationProvider location={location}>
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <TelemetryConsentPrompt />
        <OnshapeSignInCheck>
          <BomForActiveTab loading={loading} location={location} />
        </OnshapeSignInCheck>
      </main>
      <Toasts />
    </OnshapeLocationProvider>
    </PanelThemeContext.Provider>
  );
}
