export type TransitionType =
  | "hard_cut"
  | "crossfade"
  | "whip_pan"
  | "zoom_blur_cut"
  | "glitch_cut"
  | "slide"
  | "morph_shape";

export type TransitionDirection = "left" | "right" | "up" | "down";

export type TransitionEasing = "linear" | "spring";

export interface TransitionEntry {
  id: string;
  type: TransitionType;
  /** Shared boundary frame between two clips. */
  atFrame: number;
  durationInFrames: number;
  direction?: TransitionDirection;
  easing: TransitionEasing;
  triggerId?: string;
}

/** Pure transition progress 0→1 (Determinism Law). */
export function transitionProgress(
  frame: number,
  atFrame: number,
  durationInFrames: number,
  easing: TransitionEasing = "linear",
): number {
  if (durationInFrames <= 0) return frame >= atFrame ? 1 : 0;
  const local = frame - atFrame;
  if (local <= 0) return 0;
  if (local >= durationInFrames) return 1;
  const t = local / durationInFrames;
  if (easing === "spring") {
    // Approximate spring ease-in-out without wall-clock dependency
    return t * t * (3 - 2 * t);
  }
  return t;
}

/** Maps ViraEdit transition types to @remotion/transitions presentation names. */
export const REMOTION_PRESENTATION_MAP: Record<
  Exclude<TransitionType, "hard_cut" | "glitch_cut" | "zoom_blur_cut" | "whip_pan">,
  string
> = {
  crossfade: "fade",
  slide: "slide",
  morph_shape: "clockWipe",
};

/** Max glitch duration — Photosensitive Flash Safety Law (≤3 flashes/sec at 30fps). */
export const GLITCH_MAX_FRAMES = 4;
