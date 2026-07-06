/**
 * Transition render helpers — grounded in @remotion/transitions presentations.
 * Pure math lives in @types/transitions; these map to Remotion presentation props.
 */
import type { TransitionDirection, TransitionType } from "@types/transitions";
import { GLITCH_MAX_FRAMES, transitionProgress } from "@types/transitions";

export interface TransitionRenderState {
  outgoingOpacity: number;
  incomingOpacity: number;
  translateXPct: number;
  translateYPct: number;
  scale: number;
  blurPx: number;
  glitchOffsetPx: number;
}

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/** Pure transition state at frame (Transition Determinism Law). */
export function transitionStateAtFrame(
  frame: number,
  atFrame: number,
  durationInFrames: number,
  type: TransitionType,
  direction: TransitionDirection = "left",
  easing: "linear" | "spring" = "linear",
): TransitionRenderState {
  const p = transitionProgress(frame, atFrame, durationInFrames, easing);
  const base: TransitionRenderState = {
    outgoingOpacity: 1 - p,
    incomingOpacity: p,
    translateXPct: 0,
    translateYPct: 0,
    scale: 1,
    blurPx: 0,
    glitchOffsetPx: 0,
  };

  switch (type) {
    case "hard_cut":
      return {
        ...base,
        outgoingOpacity: p < 1 ? 1 : 0,
        incomingOpacity: p >= 1 ? 1 : 0,
      };
    case "crossfade":
      return base;
    case "slide": {
      const sign = direction === "right" ? 1 : direction === "left" ? -1 : 0;
      const signY = direction === "down" ? 1 : direction === "up" ? -1 : 0;
      return {
        ...base,
        translateXPct: sign * (1 - p) * 100,
        translateYPct: signY * (1 - p) * 100,
      };
    }
    case "whip_pan": {
      const sign = direction === "right" ? 1 : -1;
      const peak = Math.sin(p * Math.PI);
      return {
        ...base,
        translateXPct: sign * peak * 18,
        blurPx: peak * 12,
      };
    }
    case "zoom_blur_cut": {
      const peak = Math.sin(p * Math.PI);
      return {
        ...base,
        scale: 1 + peak * 0.15,
        blurPx: peak * 10,
        outgoingOpacity: p < 0.85 ? 1 : 1 - (p - 0.85) / 0.15,
        incomingOpacity: p > 0.85 ? (p - 0.85) / 0.15 : 0,
      };
    }
    case "glitch_cut": {
      const cappedDur = Math.min(durationInFrames, GLITCH_MAX_FRAMES);
      const local = Math.max(0, frame - atFrame);
      const active = local < cappedDur;
      const channel = local % 3;
      return {
        ...base,
        outgoingOpacity: active ? 1 : 0,
        incomingOpacity: active ? 0 : 1,
        glitchOffsetPx: active ? (channel - 1) * 3 : 0,
        translateXPct: active ? (channel - 1) * 1.5 : 0,
      };
    }
    case "morph_shape": {
      const wipe = p * 100;
      return {
        ...base,
        scale: 0.2 + p * 0.8,
        incomingOpacity: p > 0.4 ? (p - 0.4) / 0.6 : 0,
        outgoingOpacity: p < 0.6 ? 1 - p / 0.6 : 0,
        translateYPct: -wipe * 0.1,
      };
    }
    default:
      return base;
  }
}

/** Remotion presentation id for TransitionSeries wiring. */
export function remotionPresentationId(type: TransitionType): string | null {
  switch (type) {
    case "crossfade":
      return "fade";
    case "slide":
      return "slide";
    case "morph_shape":
      return "clockWipe";
    default:
      return null;
  }
}

export { CLAMP };
