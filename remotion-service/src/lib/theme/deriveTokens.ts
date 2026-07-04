import type { ThemeToken } from "../../types/theme-tokens";
import {
  accentSafeForBackground,
  contrastSafeText,
  isLight,
} from "./colorMath";

export type PartialThemeInput = Omit<ThemeToken, "colors" | "glass" | "meta"> & {
  colors: Pick<
    ThemeToken["colors"],
    "primary" | "secondary" | "accent" | "background" | "surface"
  >;
  meta?: Partial<ThemeToken["meta"]>;
};

/**
 * Runs once at theme-resolution time — never during Remotion render.
 * Computes contrast-safe on* tokens, glass opacity variants, and accent safety.
 */
export function deriveTokens(input: PartialThemeInput): ThemeToken {
  const { colors: raw } = input;

  const primaryResult = contrastSafeText(raw.primary);
  const surfaceResult = contrastSafeText(raw.surface);
  const backgroundResult = contrastSafeText(raw.background);

  const primary =
    primaryResult.adjustedBackground ?? raw.primary;
  const surface =
    surfaceResult.adjustedBackground ?? raw.surface;
  const background =
    backgroundResult.adjustedBackground ?? raw.background;

  const accent = accentSafeForBackground(raw.accent, background);

  const surfaceIsLight = isLight(surface);
  const glass = {
    surfaceOpacity: surfaceIsLight ? 0.55 : 0.1,
    borderOpacity: surfaceIsLight ? 0.35 : 0.2,
    blurStrength: surfaceIsLight ? ("lg" as const) : ("md" as const),
  };

  const onPrimary = contrastSafeText(primary).text;
  const onSurface = contrastSafeText(surface).text;
  const onBackground = contrastSafeText(background).text;

  return {
    schemaVersion: input.schemaVersion,
    identity: input.identity,
    colors: {
      primary,
      secondary: raw.secondary,
      accent,
      background,
      surface,
      onPrimary,
      onSurface,
      onBackground,
    },
    typography: input.typography,
    motion: input.motion,
    glass,
    meta: {
      source: input.meta?.source ?? "manual",
      sourceUrl: input.meta?.sourceUrl,
      resolvedAt: input.meta?.resolvedAt ?? new Date().toISOString(),
    },
  };
}
