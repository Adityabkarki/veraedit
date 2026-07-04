import { describe, expect, it } from "vitest";
import { resolveManualTheme, resolveScrapedTheme } from "../resolveTheme";
import { isValidThemeToken } from "../themeSchema";

describe("resolveTheme", () => {
  it("manual path produces valid ThemeToken", () => {
    const theme = resolveManualTheme({
      brandName: "Acme",
      colors: {
        primary: "#0EA5E9",
        secondary: "#1E293B",
        accent: "#F97316",
        background: "#0B1120",
        surface: "#1E293B",
      },
      fontPairingId: "montserrat",
    });
    expect(isValidThemeToken(theme)).toBe(true);
    expect(theme.meta.source).toBe("manual");
    expect(theme.typography.headingFont).toBe("Montserrat");
  });

  it("scraped path produces valid ThemeToken from HTML", async () => {
    const html = `
      <html><head>
        <title>Demo Brand</title>
        <meta name="theme-color" content="#2563EB" />
        <meta property="og:image" content="https://example.com/logo.png" />
        <style>body { font-family: 'Roboto', sans-serif; color: #64748B; }</style>
      </head></html>
    `;
    const result = await resolveScrapedTheme("https://example.com", async () => html);
    expect(isValidThemeToken(result.theme)).toBe(true);
    expect(result.usedFallback).toBe(false);
    expect(result.theme.meta.source).toBe("scraped");
    expect(result.theme.identity.logoUrl).toContain("logo.png");
  });

  it("scraped path falls back explicitly when no colors found", async () => {
    const result = await resolveScrapedTheme(
      "https://example.com",
      async () => "<html><body>No colors here</body></html>",
    );
    expect(result.usedFallback).toBe(true);
    expect(result.message).toContain("Couldn't extract");
  });
});
