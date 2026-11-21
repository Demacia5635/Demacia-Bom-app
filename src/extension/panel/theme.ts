/**
 * Light / dark theme of the side panel. "auto" follows the browser's (or the
 * operating system's) colour scheme. Light mode sets the same body class as
 * the web app (light-theme-active), so the shared Table styles in
 * css/LightMode.css apply; the panel's own light styles are in panelLight.css.
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

/** The saved preference and a setter; applies it, and follows the browser while on "auto". */
export function usePanelTheme(): [ThemePreference, (pref: ThemePreference) => void] {
  const [pref, setPref] = useState<ThemePreference>(readThemePreference);
  useEffect(() => {
    applyTheme(pref);
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      // Not remembered; it still applies until the panel closes.
    }
    if (pref !== "auto") return;
    const media = window.matchMedia(LIGHT_QUERY);
    const follow = () => applyTheme("auto");
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [pref]);
  return [pref, setPref];
}

/** Next preference for the theme button: auto -> light -> dark -> auto. */
export function nextThemePreference(pref: ThemePreference): ThemePreference {
  return pref === "auto" ? "light" : pref === "light" ? "dark" : "auto";
}

/** The panel's theme setting, shared from PanelApp (null outside the panel). */
export const PanelThemeContext = createContext<[ThemePreference, (pref: ThemePreference) => void] | null>(null);

export const THEME_LABELS: Record<ThemePreference, { icon: string; name: string }> = {
  auto: { icon: "◐", name: "Auto (follows the browser)" },
  light: { icon: "☀", name: "Light" },
  dark: { icon: "☾", name: "Dark" },
};

/** Current setting and setter, or null when not inside the panel. */
export function usePanelThemeSetting() {
  return useContext(PanelThemeContext);
}
