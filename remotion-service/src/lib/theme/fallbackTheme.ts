import type { ThemeToken } from "../../types/theme-tokens";
import { NEUTRAL_GRADE } from "../look/gradePresets";

/**
 * Static fallback when scrape/migration cannot derive a theme.
 * Keep color values aligned with VIRAEDIT_BRAND_KIT (see canonicalBrand.ts).
 */
export const FALLBACK_THEME: ThemeToken = {
  schemaVersion: 1,
  identity: { brandName: "ViraEdit" },
  colors: {
    primary: "#C41E3A",
    secondary: "#111113",
    accent: "#F59E0B",
    background: "#111113",
    surface: "#111113",
    onPrimary: "#FFFFFF",
    onSurface: "#F8FAFC",
    onBackground: "#F8FAFC",
  },
  typography: {
    headingFont: "Montserrat",
    bodyFont: "Open Sans",
    devanagariFont: "Noto Sans Devanagari",
    weightScale: { heading: 700, body: 400 },
  },
  motion: { defaultCurve: "elegant_glide" },
  glass: { surfaceOpacity: 0.1, borderOpacity: 0.2, blurStrength: "md" },
  grade: NEUTRAL_GRADE,
  meta: { source: "manual", resolvedAt: "1970-01-01T00:00:00.000Z" },
};

export const FALLBACK_COLORS = FALLBACK_THEME.colors;
