import { seededRandom } from "../../motion/motionMath";

/** Deterministic mock equalizer bands — Graceful Degradation fallback only. */
export function mockEqualizerBands(
  frame: number,
  barCount: number,
  seed: number,
): number[] {
  return Array.from({ length: barCount }, (_, i) => {
    const phase = seededRandom(seed, i) * Math.PI * 2;
    const base = 0.25 + seededRandom(seed, i + 50) * 0.75;
    return base * Math.abs(Math.sin(frame * 0.18 + phase + i * 0.35));
  });
}

export interface ResolvedEqualizerBands {
  bands: number[];
  isMockData: boolean;
}

/**
 * Resolve bar heights for the current frame — real analysis or explicit mock fallback.
 */
export function resolveEqualizerBands(
  frame: number,
  barCount: number,
  seed: number,
  audioAnalysis?: { frames: { frame: number; bands: number[] }[] } | null,
): ResolvedEqualizerBands {
  if (audioAnalysis?.frames?.length) {
    const entry =
      audioAnalysis.frames[frame] ??
      audioAnalysis.frames[Math.min(frame, audioAnalysis.frames.length - 1)];
    if (entry?.bands?.length) {
      const bands = Array.from({ length: barCount }, (_, i) => {
        const src = entry.bands[i % entry.bands.length] ?? 0;
        return Math.max(0, Math.min(1, src));
      });
      return { bands, isMockData: false };
    }
  }
  return {
    bands: mockEqualizerBands(frame, barCount, seed),
    isMockData: true,
  };
}
