import type { DirectorContentType } from "@types/timeline";

export type GradeBlendMode = "normal" | "overlay" | "screen" | "soft-light";

export interface GradeToken {
  contrast: number;
  saturation: number;
  warmth: number;
  vignetteIntensity: number;
  grainIntensity: number;
  blendMode: GradeBlendMode;
}

export const GRADE_PRESETS: Record<DirectorContentType, GradeToken> = {
  podcast: {
    contrast: 0.1,
    saturation: -0.05,
    warmth: 0.15,
    vignetteIntensity: 0.2,
    grainIntensity: 0.08,
    blendMode: "overlay",
  },
  consultancy: {
    contrast: 0.05,
    saturation: -0.1,
    warmth: -0.05,
    vignetteIntensity: 0.0,
    grainIntensity: 0.0,
    blendMode: "normal",
  },
  social: {
    contrast: 0.25,
    saturation: 0.2,
    warmth: 0.05,
    vignetteIntensity: 0.1,
    grainIntensity: 0.05,
    blendMode: "overlay",
  },
  showcase: {
    contrast: 0.1,
    saturation: 0.05,
    warmth: 0.0,
    vignetteIntensity: 0.0,
    grainIntensity: 0.0,
    blendMode: "normal",
  },
};

export const NEUTRAL_GRADE: GradeToken = GRADE_PRESETS.consultancy;

export function gradeForContentType(contentType: DirectorContentType): GradeToken {
  return { ...GRADE_PRESETS[contentType] };
}

export function mergeGrade(
  base: GradeToken,
  overrides?: Partial<GradeToken>,
): GradeToken {
  return { ...base, ...overrides };
}
