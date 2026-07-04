import type { ThemeToken } from "../../types/theme-tokens";
import { resolveManualTheme, type ManualThemeInput } from "./resolveTheme";

/** Editor Brand Kit shape (mirrors apps/web visualLibraryStore.BrandKit). */
export interface BrandKitInput {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontStyle?: "default" | "nepali";
  logoText?: string;
  logoUrl?: string;
}

function fontPairingForStyle(fontStyle?: "default" | "nepali"): string {
  return fontStyle === "nepali" ? "montserrat" : "inter";
}

/** Map editor Brand Kit → manual theme input (before deriveTokens). */
export function brandKitToThemeInput(kit: BrandKitInput): ManualThemeInput {
  const background = kit.secondaryColor;
  return {
    brandName: kit.logoText?.trim() || "ViraEdit",
    logoUrl: kit.logoUrl,
    colors: {
      primary: kit.primaryColor,
      secondary: kit.secondaryColor,
      accent: kit.accentColor,
      background,
      surface: background,
    },
    fontPairingId: fontPairingForStyle(kit.fontStyle),
    defaultCurve: "elegant_glide",
  };
}

/** Resolve Brand Kit → fully derived ThemeToken (run once upstream). */
export function brandKitToTheme(kit: BrandKitInput): ThemeToken {
  return resolveManualTheme(brandKitToThemeInput(kit));
}
