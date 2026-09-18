import { useState, useEffect } from 'react';

export function useThemeSync() {
  const [isLight, setIsLight] = useState<boolean>(() => {
    return localStorage.getItem('theme-preference') === 'light';
  });

  useEffect(() => {
    const themeName = isLight ? 'LightMode' : 'DarkMode';
    const linkId = 'dynamic-theme-stylesheet';
    
    let linkElement = document.getElementById(linkId) as HTMLLinkElement | null;

    if (!linkElement) {
      linkElement = document.createElement('link');
      linkElement.id = linkId;
      linkElement.rel = 'stylesheet';
      document.head.appendChild(linkElement);
    }

    // Load the correct file
    linkElement.href = `../../${themeName}.css`;

    // Toggle a class on the body so CSS scopes can latch onto it if needed
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