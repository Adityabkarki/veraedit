import { describe, expect, it } from "vitest";
import { deriveTokens } from "../deriveTokens";
import { contrastRatio } from "../colorMath";

const baseInput = {
  schemaVersion: 1,
  identity: { brandName: "Test" },
  typography: {
    headingFont: "Inter",
    bodyFont: "Inter",
    devanagariFont: "Noto Sans Devanagari",
    weightScale: { heading: 700, body: 400 },
  },
  motion: { defaultCurve: "elegant_glide" as const },
  meta: { source: "manual" as const, resolvedAt: new Date().toISOString() },
};

describe("deriveTokens", () => {
  it("derives dark-brand theme with WCAG-safe on* tokens", () => {
    const theme = deriveTokens({
      ...baseInput,
      colors: {
        primary: "#0EA5E9",
        secondary: "#1E293B",
        accent: "#F97316",
        background: "#0B1120",
        surface: "#1E293B",
      },
    });

    expect(contrastRatio(theme.colors.onSurface, theme.colors.surface)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrastRatio(theme.colors.onBackground, theme.colors.background)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(theme.glass.surfaceOpacity).toBeLessThan(0.2);
    expect(theme.glass.blurStrength).toBe("md");
  });

  it("derives light-brand theme with higher glass opacity", () => {
    const theme = deriveTokens({
      ...baseInput,
      colors: {
        primary: "#2563EB",
        secondary: "#64748B",
        accent: "#E11D48",
        background: "#F1F5F9",
        surface: "#FFFFFF",
      },
    });

    expect(theme.glass.surfaceOpacity).toBeGreaterThan(0.4);
    expect(theme.glass.blurStrength).toBe("lg");
    expect(contrastRatio(theme.colors.onBackground, theme.colors.background)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it("shifts accent when too close to background (low-contrast edge case)", () => {
    const theme = deriveTokens({
      ...baseInput,
      colors: {
        primary: "#1E293B",
        secondary: "#334155",
        accent: "#0F172A",
        background: "#0B1120",
        surface: "#1E293B",
      },
    });

    expect(theme.colors.accent).not.toBe("#0F172A");
    expect(theme.colors.accent.toLowerCase()).toMatch(/^#[0-9a-f]{6}$/);
  });
});
