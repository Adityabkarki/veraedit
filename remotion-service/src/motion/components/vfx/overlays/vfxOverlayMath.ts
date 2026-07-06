import type { VFXOverlayType } from "@types/vfx";
import { GLITCH_MAX_FRAMES } from "@types/transitions";

export interface VfxOverlayState {
  opacity: number;
  translateXPct: number;
  chromaticOffsetPx: number;
  scanlineOffset: number;
}

/** Pure VFX state at frame — Determinism Law. */
export function vfxOverlayStateAtFrame(
  localFrame: number,
  durationInFrames: number,
  type: VFXOverlayType,
  intensity: number,
): VfxOverlayState {
  const t = durationInFrames > 0 ? localFrame / durationInFrames : 0;
  const fade = Math.min(t * 4, 1, (1 - t) * 4);

  switch (type) {
    case "glitch": {
      const capped = Math.min(durationInFrames, GLITCH_MAX_FRAMES);
      const active = localFrame < capped;
      return {
        opacity: active ? intensity * fade * (1 - localFrame / capped) : 0,
        translateXPct: active ? 2 : 0,
        chromaticOffsetPx: active ? 2 : 0,
        scanlineOffset: 0,
      };
    }
    case "chromatic_aberration":
      return {
        opacity: intensity * fade,
        translateXPct: 0,
        chromaticOffsetPx: 2 * intensity,
        scanlineOffset: 0,
      };
    case "scanline":
      return {
        opacity: intensity * 0.4 * fade,
        translateXPct: 0,
        chromaticOffsetPx: 0,
        scanlineOffset: localFrame % 4,
      };
    case "light_leak":
      return {
        opacity: intensity * fade,
        translateXPct: -5 + t * 10,
        chromaticOffsetPx: 0,
        scanlineOffset: 0,
      };
    case "halftone":
      return {
        opacity: intensity * 0.35 * fade,
        translateXPct: 0,
        chromaticOffsetPx: 0,
        scanlineOffset: 0,
      };
    case "doodle":
      return {
        opacity: intensity * 0.5 * fade,
        translateXPct: 0,
        chromaticOffsetPx: 0,
        scanlineOffset: 0,
      };
    default:
      return { opacity: 0, translateXPct: 0, chromaticOffsetPx: 0, scanlineOffset: 0 };
  }
}

/** Count opacity rise events (full-contrast flashes) per second. */
export function countFlashesPerSecond(
  fps: number,
  durationInFrames: number,
  type: VFXOverlayType,
  intensity: number,
): number {
  if (type !== "glitch" && type !== "scanline") return 0;
  let flashes = 0;
  let prevHigh = false;
  const capped = Math.min(durationInFrames, GLITCH_MAX_FRAMES);
  for (let f = 0; f < capped; f++) {
    const state = vfxOverlayStateAtFrame(f, durationInFrames, type, intensity);
    const high = state.opacity > 0.5;
    if (high && !prevHigh) flashes++;
    prevHigh = high;
  }
  const seconds = capped / fps;
  return seconds > 0 ? flashes / seconds : 0;
}
