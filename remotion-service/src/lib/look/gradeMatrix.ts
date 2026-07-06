import type { GradeToken } from "./gradePresets";

/** Compose contrast + saturation into a single 5×4 SVG feColorMatrix (Precise Grading Law). */
export function buildColorMatrix(grade: GradeToken): string {
  const contrast = 1 + grade.contrast;
  const sat = 1 + grade.saturation;
  const lumR = 0.2126;
  const lumG = 0.7152;
  const lumB = 0.0722;
  const sr = (1 - sat) * lumR;
  const sg = (1 - sat) * lumG;
  const sb = (1 - sat) * lumB;
  const t = 0.5 * (1 - contrast);

  return [
    contrast * (sr + sat), contrast * sg, contrast * sb, 0, t,
    contrast * sr, contrast * (sg + sat), contrast * sb, 0, t,
    contrast * sr, contrast * sg, contrast * (sb + sat), 0, t,
    0, 0, 0, 1, 0,
  ]
    .map((v) => v.toFixed(4))
    .join(" ");
}

/** Warmth via red/blue channel balance matrix. */
export function buildWarmthMatrix(warmth: number): string {
  const w = Math.max(-1, Math.min(1, warmth));
  const r = 1 + w * 0.12;
  const b = 1 - w * 0.12;
  return [
    r, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, b, 0, 0,
    0, 0, 0, 1, 0,
  ]
    .map((v) => v.toFixed(4))
    .join(" ");
}

export function vignetteOpacity(intensity: number): number {
  return Math.max(0, Math.min(0.85, intensity * 0.75));
}

export function grainOpacity(intensity: number, frame: number, noiseFrameCount: number): number {
  if (intensity <= 0) return 0;
  const cycle = frame % noiseFrameCount;
  const flicker = 0.85 + (cycle / noiseFrameCount) * 0.15;
  return intensity * 0.35 * flicker;
}
