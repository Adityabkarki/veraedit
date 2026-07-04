import type { ThemeToken } from "../../types/theme-tokens";
import { deriveTokens, type PartialThemeInput } from "./deriveTokens";
import { isValidThemeToken } from "./themeSchema";
import { mapToCuratedFont, resolveFontPairingId } from "./curatedFonts";
import { parseHex, rgbToHsl } from "./colorMath";
import { FALLBACK_COLORS, FALLBACK_THEME } from "./fallbackTheme";

export interface ManualThemeInput {
  brandName: string;
  logoUrl?: string;
  faviconUrl?: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
  };
  fontPairingId?: string;
  defaultCurve?: ThemeToken["motion"]["defaultCurve"];
}

export interface ScrapeThemeResult {
  theme: ThemeToken;
  /** True when extraction failed and DEFAULT_THEME was used instead. */
  usedFallback: boolean;
  message?: string;
}

const HEX_RE = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;

function normalizeHex(raw: string): string | null {
  const h = raw.startsWith("#") ? raw : `#${raw}`;
  if (/^#[0-9A-Fa-f]{6}$/.test(h)) return h;
  if (/^#[0-9A-Fa-f]{3}$/.test(h)) {
    const c = h.slice(1);
    return `#${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`;
  }
  return null;
}

function saturation(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const [, s] = rgbToHsl(r, g, b);
  return s;
}

function isNeutral(hex: string): boolean {
  const { r, g, b } = parseHex(hex);
  const [, s] = rgbToHsl(r, g, b);
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return s < 0.12 || spread < 18;
}

function assignColorsFromPalette(
  palette: string[],
  fallback: ThemeToken["colors"],
): Pick<
  ThemeToken["colors"],
  "primary" | "secondary" | "accent" | "background" | "surface"
> {
  const unique = [...new Set(palette.map(normalizeHex).filter(Boolean) as string[])];
  if (unique.length === 0) {
    return {
      primary: fallback.primary,
      secondary: fallback.secondary,
      accent: fallback.accent,
      background: fallback.background,
      surface: fallback.surface,
    };
  }

  const byFreq = unique;
  const nonNeutral = byFreq.filter((c) => !isNeutral(c));
  const accentCandidate =
    [...nonNeutral].sort((a, b) => saturation(b) - saturation(a))[0] ??
    byFreq[0];
  const background = byFreq[0] ?? fallback.background;
  const surface =
    byFreq.find((c) => c !== background && !isNeutral(c)) ??
    byFreq[1] ??
    fallback.surface;
  const primary =
    nonNeutral.find((c) => c !== accentCandidate && c !== background) ??
    accentCandidate;
  const secondary = byFreq.find((c) => c !== primary && c !== background) ?? fallback.secondary;

  return { primary, secondary, accent: accentCandidate, background, surface };
}

function buildPartial(
  input: Omit<PartialThemeInput, "schemaVersion">,
): ThemeToken {
  const derived = deriveTokens({ schemaVersion: 1, ...input });
  if (!isValidThemeToken(derived)) {
    throw new Error("deriveTokens produced invalid ThemeToken");
  }
  return derived;
}

/** Path A — manual onboarding form values. */
export function resolveManualTheme(input: ManualThemeInput): ThemeToken {
  const fonts = input.fontPairingId
    ? resolveFontPairingId(input.fontPairingId)
    : resolveFontPairingId("inter");

  return buildPartial({
    identity: {
      brandName: input.brandName,
      logoUrl: input.logoUrl,
      faviconUrl: input.faviconUrl,
    },
    colors: {
      primary: normalizeHex(input.colors.primary) ?? FALLBACK_COLORS.primary,
      secondary: normalizeHex(input.colors.secondary) ?? FALLBACK_COLORS.secondary,
      accent: normalizeHex(input.colors.accent) ?? FALLBACK_COLORS.accent,
      background: normalizeHex(input.colors.background) ?? FALLBACK_COLORS.background,
      surface: normalizeHex(input.colors.surface) ?? FALLBACK_COLORS.surface,
    },
    typography: {
      headingFont: fonts.headingFont,
      bodyFont: fonts.bodyFont,
      devanagariFont: fonts.devanagariFont,
      weightScale: { heading: 700, body: 400 },
    },
    motion: { defaultCurve: input.defaultCurve ?? "elegant_glide" },
    meta: { source: "manual", resolvedAt: new Date().toISOString() },
  });
}

function extractMeta(html: string, property: string): string | null {
  const og = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const name = new RegExp(
    `<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const ogRev = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
    "i",
  );
  return html.match(og)?.[1] ?? html.match(name)?.[1] ?? html.match(ogRev)?.[1] ?? null;
}

function extractLinkRel(html: string, rel: string): string | null {
  const re = new RegExp(
    `<link[^>]+rel=["'][^"']*${rel}[^"']*["'][^>]+href=["']([^"']+)["']`,
    "i",
  );
  const rev = new RegExp(
    `<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*${rel}[^"']*["']`,
    "i",
  );
  return html.match(re)?.[1] ?? html.match(rev)?.[1] ?? null;
}

function extractTitle(html: string): string | null {
  return html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
}

function extractFontFamily(html: string): string {
  const bodyFont =
    html.match(/body\s*\{[^}]*font-family:\s*([^;}"']+)/i)?.[1] ??
    html.match(/font-family:\s*([^;}"']+)/i)?.[1] ??
    "Inter";
  return bodyFont.replace(/['"]/g, "").split(",")[0].trim();
}

function resolveUrl(base: string, href: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function extractHexColors(html: string): string[] {
  const themeColor = extractMeta(html, "theme-color");
  const matches = html.match(HEX_RE) ?? [];
  const colors = matches.map(normalizeHex).filter(Boolean) as string[];
  if (themeColor) {
    const n = normalizeHex(themeColor);
    if (n) colors.unshift(n);
  }
  return colors;
}

export type FetchHtml = (url: string) => Promise<string>;

const defaultFetchHtml: FetchHtml = async (url) => {
  const res = await fetch(url, {
    headers: { "User-Agent": "ViraEdit-ThemeResolver/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
};

/** Path B — scrape reference URL for brand identity. */
export async function resolveScrapedTheme(
  url: string,
  fetchHtml: FetchHtml = defaultFetchHtml,
): Promise<ScrapeThemeResult> {
  try {
    const html = await fetchHtml(url);
    const palette = extractHexColors(html);
    const brandName =
      extractMeta(html, "og:site_name") ??
      extractTitle(html) ??
      FALLBACK_THEME.identity.brandName;

    const logoUrl =
      extractLinkRel(html, "apple-touch-icon") ??
      extractMeta(html, "og:image") ??
      extractLinkRel(html, "icon") ??
      undefined;

    const faviconUrl = extractLinkRel(html, "icon") ?? logoUrl;
    const fonts = mapToCuratedFont(extractFontFamily(html));

    if (palette.length === 0) {
      return {
        theme: FALLBACK_THEME,
        usedFallback: true,
        message:
          "Couldn't extract a theme from this link, using default — want to set colors manually?",
      };
    }

    const colors = assignColorsFromPalette(palette, FALLBACK_COLORS);
    const theme = buildPartial({
      identity: {
        brandName,
        logoUrl: logoUrl ? resolveUrl(url, logoUrl) : undefined,
        faviconUrl: faviconUrl ? resolveUrl(url, faviconUrl) : undefined,
      },
      colors,
      typography: {
        headingFont: fonts.headingFont,
        bodyFont: fonts.bodyFont,
        devanagariFont: fonts.devanagariFont,
        weightScale: { heading: 700, body: 400 },
      },
      motion: { defaultCurve: "elegant_glide" },
      meta: {
        source: "scraped",
        sourceUrl: url,
        resolvedAt: new Date().toISOString(),
      },
    });

    return { theme, usedFallback: false };
  } catch {
    return {
      theme: DEFAULT_THEME,
      usedFallback: true,
      message:
        "Couldn't extract a theme from this link, using default — want to set colors manually?",
    };
  }
}

export function resolveTheme(
  source: { type: "manual"; input: ManualThemeInput } | { type: "scraped"; url: string },
  fetchHtml?: FetchHtml,
): ThemeToken | Promise<ThemeToken | ScrapeThemeResult> {
  if (source.type === "manual") {
    return resolveManualTheme(source.input);
  }
  return resolveScrapedTheme(source.url, fetchHtml);
}

/** Light test theme for pillar preview side-by-side verification. */
export const TEST_LIGHT_THEME: ThemeToken = resolveManualTheme({
  brandName: "Light Brand Co",
  colors: {
    primary: "#2563EB",
    secondary: "#64748B",
    accent: "#E11D48",
    background: "#F1F5F9",
    surface: "#FFFFFF",
  },
  fontPairingId: "poppins",
  defaultCurve: "elegant_glide",
});
