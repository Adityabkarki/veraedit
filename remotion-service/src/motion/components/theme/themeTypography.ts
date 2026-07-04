import type { CSSProperties } from "react";
import type { ThemeToken } from "@types/theme-tokens";
import { typographyWrapperStyle } from "../typography";

/** Typography wrapper that reads font tokens from a resolved ThemeToken. */
export function themeTypographyStyle(
  text: string,
  theme: ThemeToken,
  extras: CSSProperties = {},
): CSSProperties {
  const fontFamily = /[\u0900-\u097F]/.test(text)
    ? theme.typography.devanagariFont
    : theme.typography.bodyFont;
  return typographyWrapperStyle(text, fontFamily, extras);
}
