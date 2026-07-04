import { z } from "zod";
import type { ThemeToken } from "../../types/theme-tokens";

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const themeTokenSchema = z.object({
  schemaVersion: z.number().int().positive(),
  identity: z.object({
    brandName: z.string().min(1),
    logoUrl: z.string().url().optional(),
    faviconUrl: z.string().url().optional(),
  }),
  colors: z.object({
    primary: hexColor,
    secondary: hexColor,
    accent: hexColor,
    background: hexColor,
    surface: hexColor,
    onPrimary: hexColor,
    onSurface: hexColor,
    onBackground: hexColor,
  }),
  typography: z.object({
    headingFont: z.string().min(1),
    bodyFont: z.string().min(1),
    devanagariFont: z.string().min(1),
    weightScale: z.object({
      heading: z.number(),
      body: z.number(),
    }),
  }),
  motion: z.object({
    defaultCurve: z.enum(["snappy_spring", "elegant_glide", "elastic_overshoot"]),
  }),
  glass: z.object({
    surfaceOpacity: z.number().min(0).max(1),
    borderOpacity: z.number().min(0).max(1),
    blurStrength: z.enum(["sm", "md", "lg"]),
  }),
  meta: z.object({
    source: z.enum(["manual", "scraped"]),
    sourceUrl: z.string().url().optional(),
    resolvedAt: z.string().datetime(),
  }),
});

export function parseThemeToken(value: unknown): ThemeToken | null {
  const result = themeTokenSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function isValidThemeToken(value: unknown): value is ThemeToken {
  return themeTokenSchema.safeParse(value).success;
}
