import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export const THEMES = ['default', 'liceo'] as const;
export type ThemeName = (typeof THEMES)[number];
export const THEME_LABEL: Record<ThemeName, string> = { default: 'Ocryon', liceo: 'Liceo' };

const STORAGE_KEY = 'ocryon:theme';

function readStoredTheme(): ThemeName {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'liceo' ? 'liceo' : 'default';
  } catch {
    return 'default';
  }
}

function applyTheme(theme: ThemeName) {
  if (theme === 'default') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

// Se aplica apenas se carga el módulo (antes del primer render) para no parpadear con el tema por defecto.
applyTheme(readStoredTheme());

const ThemeContext = createContext<{ theme: ThemeName; setTheme: (theme: ThemeName) => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(readStoredTheme);

  useEffect(() => applyTheme(theme), [theme]);

  const setTheme = (next: ThemeName) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Si el almacenamiento está bloqueado, el tema igual queda aplicado para esta sesión.
    }
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return ctx;
}
