import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useMediaQuery } from './useMediaQuery';

type Theme = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const STORAGE_KEY = 'mawimbi-theme';
const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'dark';
}

function applyTheme(theme: Theme) {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia(DARK_SCHEME_QUERY).matches);

  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const systemPrefersDark = useMediaQuery(DARK_SCHEME_QUERY);

  const setTheme = useCallback((newTheme: Theme) => {
    localStorage.setItem(STORAGE_KEY, newTheme);
    setThemeState(newTheme);
    applyTheme(newTheme);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Re-applies when the OS-level dark/light preference changes while the
  // user has selected 'system' — the effect above already handles
  // user-initiated theme changes, so this one intentionally reacts only to
  // systemPrefersDark, not theme, to avoid a redundant double-apply.
  useEffect(() => {
    if (theme !== 'system') return;
    applyTheme('system');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemPrefersDark]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
