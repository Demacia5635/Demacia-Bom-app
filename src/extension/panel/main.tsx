import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./panel.css";
// Shared Table styles (the web app loads these from MainLayout).
import "../../css/DarkMode.css";
// Light theme (theme.ts): the shared Table's, then the panel's own.
import "../../css/LightMode.css";
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
