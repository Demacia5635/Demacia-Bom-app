import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./panel.css";
// Shared Table styles, dark then light (the web app loads them from MainLayout).
import "../../css/table.css";
// The panel's own light styles (theme.ts).
import "./panelLight.css";
import { applyTheme, readThemePreference } from "./theme";
import PanelApp from "./PanelApp";
import { installRequestTracking, SlowRequestNotice } from "../../util/slowRequests";
import { reportPanelOpen } from "../onshapeTab";

// Before the first render, so a light panel doesn't flash dark.
applyTheme(readThemePreference());

// Show what the user is waiting for when a request takes more than 3 s.
installRequestTracking();

// Lets a second click on the icon / "BOM" button close this panel (Chrome).
reportPanelOpen();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PanelApp />
    <SlowRequestNotice />
  </StrictMode>
);
