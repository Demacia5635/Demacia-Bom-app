import { useState, useEffect } from 'react';

export function useThemeSync() {
  const [isLight, setIsLight] = useState<boolean>(() => {
    return localStorage.getItem('theme-preference') === 'light';
  });

  useEffect(() => {
    // Both theme stylesheets are bundled (imported by MainLayout) and scoped by
    // these body classes, so no stylesheet needs loading here.
    document.body.classList.toggle('light-theme-active', isLight);
    document.body.classList.toggle('dark-theme-active', !isLight);

    const handleThemeChange = () => {
      setIsLight(localStorage.getItem('theme-preference') === 'light');
    };

    window.addEventListener('theme-changed', handleThemeChange);
    window.addEventListener('storage', handleThemeChange);

    return () => {
      window.removeEventListener('theme-changed', handleThemeChange);
      window.removeEventListener('storage', handleThemeChange);
    };
  }, [isLight]);

  const toggleTheme = () => {
    const nextState = !isLight;
    localStorage.setItem('theme-preference', nextState ? 'light' : 'dark');
    setIsLight(nextState);
    window.dispatchEvent(new CustomEvent('theme-changed'));
  };

  return { isLight, toggleTheme };
}