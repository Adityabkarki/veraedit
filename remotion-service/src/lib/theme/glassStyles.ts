import type { CSSProperties } from "react";
import type { ThemeToken } from "../../types/theme-tokens";
import { withAlpha } from "./colorMath";

const BLUR_MAP = { sm: "8px", md: "16px", lg: "24px" } as const;

export function glassSurfaceStyle(theme: ThemeToken): CSSProperties {
  const { glass, colors } = theme;
  return {
    background: withAlpha(colors.surface, glass.surfaceOpacity),
    border: `1px solid ${withAlpha(colors.onSurface, glass.borderOpacity)}`,
    backdropFilter: `blur(${BLUR_MAP[glass.blurStrength]})`,
    WebkitBackdropFilter: `blur(${BLUR_MAP[glass.blurStrength]})`,
    boxShadow: `0 12px 40px ${withAlpha(colors.background, 0.35)}, inset 0 1px 0 ${withAlpha(colors.onSurface, 0.12)}`,
  };
}

export function glassCardStyle(theme: ThemeToken): CSSProperties {
  const { glass, colors } = theme;
  return {
    background: withAlpha(colors.surface, glass.surfaceOpacity + 0.15),
    border: `1px solid ${withAlpha(colors.onSurface, glass.borderOpacity)}`,
    backdropFilter: `blur(${BLUR_MAP[glass.blurStrength === "sm" ? "sm" : "md"]})`,
    WebkitBackdropFilter: `blur(${BLUR_MAP[glass.blurStrength === "sm" ? "sm" : "md"]})`,
    boxShadow: `0 8px 24px ${withAlpha(colors.background, 0.35)}`,
  };
}
