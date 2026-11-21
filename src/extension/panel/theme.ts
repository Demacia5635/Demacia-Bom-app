/**
 * Light / dark theme of the side panel. "auto" follows the browser's (or the
 * operating system's) colour scheme. Light mode sets the same body class as
 * the web app (light-theme-active), so the shared Table styles in
 * css/table.css apply; the panel's own light styles are in panelLight.css.
 * Dark mode is the panel's original look (no class).
 */
import { createContext, useContext, useEffect, useState } from "react";

export type ThemePreference = "auto" | "light" | "dark";

const STORAGE_KEY = "demacia-bom:theme";
const LIGHT_QUERY = "(prefers-color-scheme: light)";

export function readThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "auto";
  } catch {
    return "auto";
  }
}

function isLight(pref: ThemePreference): boolean {
  return pref === "light" || (pref === "auto" && window.matchMedia(LIGHT_QUERY).matches);
}

/** Puts the theme on the page (body class + the browser's color-scheme for scrollbars and form controls). */
export function applyTheme(pref: ThemePreference): void {
  const light = isLight(pref);
  document.body.classList.toggle("light-theme-active", light);
  document.documentElement.style.colorScheme = light ? "light" : "dark";
}

/**
 * The panel's theme, like the website's switch (components/Appbar.tsx): one
 * button flips between light and dark. Until it's first used the panel is on
 * "auto" and follows the browser; after that the choice is remembered.
 */
export interface PanelTheme {
  /** Whether light mode is showing now. */
  isLight: boolean;
  /** Switches to the other theme and remembers it. */
  toggle: () => void;
}

export function usePanelTheme(): PanelTheme {
  const [pref, setPref] = useState<ThemePreference>(readThemePreference);
  const [light, setLight] = useState(() => isLight(pref));
  useEffect(() => {
    const show = () => {
      applyTheme(pref);
      setLight(isLight(pref));
    };
    show();
    try {
      if (pref === "auto") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      // Not remembered; it still applies until the panel closes.
    }
    if (pref !== "auto") return;
    const media = window.matchMedia(LIGHT_QUERY);
    media.addEventListener("change", show);
    return () => media.removeEventListener("change", show);
  }, [pref]);
  return { isLight: light, toggle: () => setPref(light ? "dark" : "light") };
}

/** The panel's theme, shared from PanelApp (null outside the panel). */
export const PanelThemeContext = createContext<PanelTheme | null>(null);

/** The panel's theme, or null when not inside the panel. */
export function usePanelThemeSetting(): PanelTheme | null {
  return useContext(PanelThemeContext);
}
