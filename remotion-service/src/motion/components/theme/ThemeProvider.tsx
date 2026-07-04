import React, { createContext, useContext, useMemo } from "react";
import { DEFAULT_THEME, type ThemeToken } from "@types/theme-tokens";
import { parseThemeToken } from "@lib/theme/themeSchema";

const ThemeContext = createContext<ThemeToken>(DEFAULT_THEME);

export interface ThemeProviderProps {
  theme?: ThemeToken | null;
  children: React.ReactNode;
}

function resolveTheme(theme?: ThemeToken | null): ThemeToken {
  if (!theme) return DEFAULT_THEME;
  const parsed = parseThemeToken(theme);
  if (!parsed) {
    console.warn(
      "[ThemeProvider] Invalid theme shape — falling back to DEFAULT_THEME",
    );
    return DEFAULT_THEME;
  }
  return parsed;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  theme,
  children,
}) => {
  const resolved = useMemo(() => resolveTheme(theme), [theme]);
  return (
    <ThemeContext.Provider value={resolved}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeToken => {
  const theme = useContext(ThemeContext);
  return theme ?? DEFAULT_THEME;
};
