/**
 * Side panel root. Extension pages have no meaningful URL path, so routing is
 * in-memory. Routes mirror the web app paths AssemblyBomPage navigates to;
 * /signin and /signup resolve the user from the Onshape session instead of a
 * Demacia account.
 */
import { type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AssemblyBomPage from "../../assembly-extension/AssemblyBomPage";
import { OnshapeLocationProvider } from "../onshapeHostShim";
import { setOnshapeServer } from "../onshapeDirect";
import { useActiveOnshapeTab, type OnshapeLocation } from "../onshapeTab";
import OnshapeIdentity from "./OnshapeIdentity";
import { Toasts } from "./toast";

function Message({ children }: { children: ReactNode }) {
  return (
    <div className="p-4">
      <h1 className="text-base font-bold mb-3">Demacia BOM</h1>
      <p className="text-sm text-zinc-500">{children}</p>
    </div>
  );
}

/** The BOM page for the active tab, or a hint when the tab isn't an Onshape element. */
function BomForActiveTab({ loading, location }: { loading: boolean; location: OnshapeLocation | null }) {
  if (loading) return <Message>Reading the active tab…</Message>;
  if (!location) return <Message>Open an Onshape assembly tab to see its bill of materials.</Message>;
  // Remount per element so each assembly starts from a clean state.
  return <AssemblyBomPage key={`${location.documentId}/${location.wvmType}/${location.wvmId}/${location.elementId}`} />;
}

export default function PanelApp() {
  const { loading, location } = useActiveOnshapeTab();

  // Direct Onshape calls go to whichever Onshape server the active tab is on.
  // Set during render (idempotent) rather than in an effect: child effects,
  // like OnshapeIdentity's session lookup, run before the parent's.
  if (location) setOnshapeServer(location.server);

  const bomPage = <BomForActiveTab loading={loading} location={location} />;

  return (
    <OnshapeLocationProvider location={location}>
      {/* Start at /signin so the user is re-read from Onshape each time the panel opens. */}
      <MemoryRouter initialEntries={["/signin"]}>
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
          <Routes>
            <Route path="/signin" element={<OnshapeIdentity />} />
            <Route path="/signup" element={<OnshapeIdentity />} />

            {/* "/" is where SignIn lands; "/onshape" is where SignUp lands. */}
            <Route path="/onshape" element={bomPage} />
            <Route path="*" element={bomPage} />
          </Routes>
        </main>
        <Toasts />
      </MemoryRouter>
    </OnshapeLocationProvider>
  );
}
