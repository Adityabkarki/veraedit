export interface ThemeToken {
  schemaVersion: number;

  identity: {
    brandName: string;
    logoUrl?: string;
    faviconUrl?: string;
  };

  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;

    onPrimary: string;
    onSurface: string;
    onBackground: string;
  };

  typography: {
    headingFont: string;
    bodyFont: string;
    devanagariFont: string;
    weightScale: {
      heading: number;
      body: number;
    };
  };

  motion: {
    defaultCurve: "snappy_spring" | "elegant_glide" | "elastic_overshoot";
  };

  glass: {
    surfaceOpacity: number;
    borderOpacity: number;
    blurStrength: "sm" | "md" | "lg";
  };

  /** Color grade — always applied per composition (Grade Consistency Law). */
  grade: import("../lib/look/gradePresets").GradeToken;

  meta: {
    source: "manual" | "scraped";
    sourceUrl?: string;
    resolvedAt: string;
  };
}

export { DEFAULT_THEME } from "../lib/theme/defaultTheme";
