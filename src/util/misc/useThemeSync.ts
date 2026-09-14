// hooks/useThemeSync.ts
import { useState, useEffect } from 'react';

export function useThemeSync() {
  const [isLight, setIsLight] = useState<boolean>(() => {
    return localStorage.getItem('theme-preference') === 'light';
  });

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'theme-preference') {
        setIsLight(e.newValue === 'light');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const toggleTheme = () => {
    const nextState = !isLight;
    setIsLight(nextState);
    localStorage.setItem('theme-preference', nextState ? 'light' : 'dark');
    // Dispatch custom event for tabs/components in the same window context
    window.dispatchEvent(new Event('storage'));
  };

  return { isLight, toggleTheme };
}