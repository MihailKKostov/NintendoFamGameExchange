import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { play, setSoundsEnabled, soundsEnabled } from '../lib/sounds';

export type ThemePref = 'system' | 'light' | 'dark';

interface Settings {
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
  sounds: boolean;
  setSounds: (on: boolean) => void;
}

const SettingsContext = createContext<Settings | null>(null);

const readTheme = (): ThemePref => {
  try {
    const t = localStorage.getItem('fge-theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>(readTheme);
  const [sounds, setSoundsState] = useState(soundsEnabled());

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('fge-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    play('toggle');
  }, []);
  const setSounds = useCallback((on: boolean) => {
    setSoundsEnabled(on);
    setSoundsState(on);
    if (on) play('toggle');
  }, []);

  const value = useMemo(() => ({ theme, setTheme, sounds, setSounds }), [theme, setTheme, sounds, setSounds]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings outside provider');
  return ctx;
}
