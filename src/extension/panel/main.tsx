import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./panel.css";
// Shared Table styles (the web app loads these from MainLayout).
import "../../css/DarkMode.css";
import PanelApp from "./PanelApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PanelApp />
  </StrictMode>
);
