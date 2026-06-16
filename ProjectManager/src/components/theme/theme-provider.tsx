"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Theme model:
 * - "light" / "dark" — explicit user choice.
 * - "system"        — follow the OS (prefers-color-scheme).
 *
 * The chosen value is written to <html data-theme="…">; the CSS in globals.css
 * resolves the actual purpose-token colors from that attribute. Persisted to
 * localStorage so the choice survives reloads.
 */
export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "bizbeecms-theme";

type ThemeContextValue = {
  /** The user's selection (may be "system"). */
  theme: Theme;
  /** The concrete theme currently rendered ("light" | "dark"). */
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(theme: Theme): "light" | "dark" {
  if (theme === "system") return systemPrefersDark() ? "dark" : "light";
  return theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Default to "system" on the server; the inline script (see ThemeScript)
  // sets data-theme before paint, so there is no flash.
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  // Hydrate the persisted choice once on mount.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial: Theme =
      stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : "system";
    setThemeState(initial);
  }, []);

  // Reflect the choice into the DOM + resolve concrete theme.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    setResolvedTheme(resolve(theme));
  }, [theme]);

  // When following the system, react to OS preference changes live.
  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolvedTheme(mql.matches ? "dark" : "light");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

/**
 * Blocking inline script that applies the persisted (or system) theme to
 * <html data-theme> BEFORE first paint, so there is no light/dark flash.
 * Render it in <head> via layout.tsx.
 */
export function ThemeScript() {
  const js = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
    STORAGE_KEY,
  )});if(t!=="light"&&t!=="dark"&&t!=="system"){t="system";}document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","system");}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
