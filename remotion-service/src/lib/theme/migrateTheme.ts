import { FALLBACK_THEME, type ThemeToken } from "./fallbackTheme";
import { DEFAULT_THEME } from "./defaultTheme";
import { deriveTokens } from "./deriveTokens";
import { isValidThemeToken } from "./themeSchema";

type LegacyThemeV0 = {
  schemaVersion?: number;
  brandName?: string;
  brandColor?: string;
  accentColor?: string;
  fontFamily?: string;
};

/**
 * Pure migration — upgrades stored project themes to the current schemaVersion.
 */
export function migrateTheme(
  raw: unknown,
  version?: number,
): ThemeToken {
  const v =
    version ??
    (typeof raw === "object" && raw !== null && "schemaVersion" in raw
      ? Number((raw as { schemaVersion?: number }).schemaVersion)
      : 0);

  if (v >= 1 && isValidThemeToken(raw)) {
    return raw;
  }

  if (v === 0 || v < 1) {
    const legacy = (raw ?? {}) as LegacyThemeV0;
    return deriveTokens({
      schemaVersion: 1,
      identity: {
        brandName: legacy.brandName ?? DEFAULT_THEME.identity.brandName,
      },
      colors: {
        primary: legacy.brandColor ?? DEFAULT_THEME.colors.primary,
        secondary: DEFAULT_THEME.colors.secondary,
        accent: legacy.accentColor ?? DEFAULT_THEME.colors.accent,
        background: DEFAULT_THEME.colors.background,
        surface: DEFAULT_THEME.colors.surface,
      },
      typography: {
        headingFont: legacy.fontFamily ?? DEFAULT_THEME.typography.headingFont,
        bodyFont: legacy.fontFamily ?? DEFAULT_THEME.typography.bodyFont,
        devanagariFont: DEFAULT_THEME.typography.devanagariFont,
        weightScale: DEFAULT_THEME.typography.weightScale,
      },
      motion: DEFAULT_THEME.motion,
      meta: { source: "manual", resolvedAt: new Date().toISOString() },
    });
  }

  console.warn(
    `[migrateTheme] Unknown schemaVersion ${v} — falling back to DEFAULT_THEME`,
  );
  return DEFAULT_THEME;
}
