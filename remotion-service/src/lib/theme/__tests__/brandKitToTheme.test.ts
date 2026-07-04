import { describe, expect, it } from "vitest";
import { brandKitToTheme } from "../brandKitToTheme";
import { VIRAEDIT_BRAND_KIT } from "../canonicalBrand";
import { isValidThemeToken } from "../themeSchema";

describe("brandKitToTheme", () => {
  it("resolves canonical brand kit to valid ThemeToken", () => {
    const theme = brandKitToTheme(VIRAEDIT_BRAND_KIT);
    expect(isValidThemeToken(theme)).toBe(true);
    expect(theme.colors.primary.toLowerCase()).toBe("#c41e3a");
    expect(theme.colors.accent.toLowerCase()).toBe("#f59e0b");
    expect(theme.identity.brandName).toBe("ViraEdit");
    expect(theme.typography.devanagariFont).toBe("Noto Sans Devanagari");
  });

  it("maps light brand kit with readable on* tokens", () => {
    const theme = brandKitToTheme({
      primaryColor: "#2563EB",
      secondaryColor: "#F1F5F9",
      accentColor: "#E11D48",
      fontStyle: "default",
      logoText: "Light Co",
    });
    expect(theme.colors.background.toLowerCase()).toBe("#f1f5f9");
    expect(theme.glass.surfaceOpacity).toBeGreaterThan(0.4);
  });
});
