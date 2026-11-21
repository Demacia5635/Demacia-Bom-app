import { useCallback, useSyncExternalStore } from 'react';

/**
 * The website's light / dark theme: one shared value (the browser's saved
 * preference) instead of a copy per component. index.html sets the body
 * classes before React loads, so a light-theme user sees no dark flash; this
 * module keeps them in step after that (also with other tabs).
 */
const STORAGE_KEY = 'theme-preference';
const CHANGE_EVENT = 'theme-changed';

function readIsLight(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light';
  } catch {
    return false; // storage blocked: the default, dark
  }
}

/** Both theme stylesheets are bundled (MainLayout) and scoped by these body classes. */
function applyThemeClasses(isLight: boolean): void {
  document.body.classList.toggle('light-theme-active', isLight);
  document.body.classList.toggle('dark-theme-active', !isLight);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// Once for the page: the body classes follow the preference, including a
// change made in another tab.
if (typeof window !== 'undefined') {
  applyThemeClasses(readIsLight());
  subscribe(() => applyThemeClasses(readIsLight()));
}

export function useThemeSync() {
  const isLight = useSyncExternalStore(subscribe, readIsLight, () => false);

  const toggleTheme = useCallback(() => {
    const next = !readIsLight();
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'light' : 'dark');
    } catch {
      /* not remembered: still switch for this page */
    }
    applyThemeClasses(next);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }, []);

  return { isLight, toggleTheme };
}
