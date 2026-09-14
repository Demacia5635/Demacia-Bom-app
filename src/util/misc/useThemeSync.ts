import { useState, useEffect } from 'react';

export function useThemeSync() {
  const [isLight, setIsLight] = useState<boolean>(() => {
    return localStorage.getItem('theme-preference') === 'light';
  });

  useEffect(() => {
    const handleThemeChange = () => {
      setIsLight(localStorage.getItem('theme-preference') === 'light');
    };

    window.addEventListener('theme-changed', handleThemeChange);
    window.addEventListener('storage', handleThemeChange);

    return () => {
      window.removeEventListener('theme-changed', handleThemeChange);
      window.removeEventListener('storage', handleThemeChange);
    };
  }, []);

  const toggleTheme = () => {
    const nextState = !isLight;
    
    // 1. Immediately update local storage
    localStorage.setItem('theme-preference', nextState ? 'light' : 'dark');
    
    // 2. Update local state so THIS component and any listening components update
    setIsLight(nextState);
    
    // 3. Broadcast to other open components/tabs
    window.dispatchEvent(new CustomEvent('theme-changed'));
  };

  return { isLight, toggleTheme };
}