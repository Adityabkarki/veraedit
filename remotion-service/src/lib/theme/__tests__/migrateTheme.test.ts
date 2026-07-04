import { describe, expect, it } from "vitest";
import { migrateTheme } from "../migrateTheme";
import { DEFAULT_THEME } from "../../../types/theme-tokens";
import { isValidThemeToken } from "../themeSchema";

describe("migrateTheme", () => {
  it("passes through current schema unchanged", () => {
    const theme = migrateTheme(DEFAULT_THEME);
    expect(theme).toEqual(DEFAULT_THEME);
  });

  it("upgrades legacy v0 brandColor/accentColor shape", () => {
    const legacy = {
      brandName: "Legacy Co",
      brandColor: "#FF0000",
      accentColor: "#00FF00",
      fontFamily: "Montserrat",
    };
    const theme = migrateTheme(legacy, 0);
    expect(isValidThemeToken(theme)).toBe(true);
    expect(theme.schemaVersion).toBe(1);
    expect(theme.colors.primary.toLowerCase()).toBe("#e00000");
    expect(theme.colors.accent.toLowerCase()).toBe("#00ff00");
    expect(theme.typography.headingFont).toBe("Montserrat");
  });
});
