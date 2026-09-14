import { useState, useEffect } from 'react';

export function useThemeSync() {
  const [isLight, setIsLight] = useState<boolean>(() => {
    return localStorage.getItem('theme-preference') === 'light';
  });

  useEffect(() => {
    const handleThemeChange = () => {
      setIsLight(localStorage.getItem('theme-preference') === 'light');
    };

    // Listen for custom events within the same window & storage events across tabs
    window.addEventListener('theme-changed', handleThemeChange);
    window.addEventListener('storage', handleThemeChange);

    return () => {
      window.removeEventListener('theme-changed', handleThemeChange);
      window.removeEventListener('storage', handleThemeChange);
    };
  }, []);

  const toggleTheme = () => {
    const nextState = !isLight;
    setIsLight(nextState);
    localStorage.setItem('theme-preference', nextState ? 'light' : 'dark');
    
    // Dispatch custom event to trigger instant updates across all components in this window
    window.dispatchEvent(new CustomEvent('theme-changed'));
  };

  return { isLight, toggleTheme };
}