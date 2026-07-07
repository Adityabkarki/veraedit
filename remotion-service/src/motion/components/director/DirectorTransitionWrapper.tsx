/**
 * Director transition wrapper — applies the visual side of
 * DirectorTimeline.tracks.transitions to the composed frame stack.
 *
 * The Director video track renders clips as adjacent hard-cut Sequences, so
 * two-clip blending is not available; instead each TransitionEntry drives a
 * deterministic full-frame treatment (whip-pan shake+blur, zoom-blur punch,
 * glitch channel split, crossfade dip) centered on the shared cut frame via
 * transitionStateAtFrame — the same pure math the SFX attribution uses, so
 * whoosh cues and visible motion land on the same frames.
 *
 * Laws honored: Transition Determinism (pure function of frame + entry),
 * Photosensitive Flash Safety (glitch capped in transitionMath), Interpolation
 * Clamping (all math clamped in @types/transitions).
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { TransitionEntry } from "@types/transitions";
import { transitionStateAtFrame } from "../transitions/transitionMath";

export interface DirectorTransitionWrapperProps {
  transitions: TransitionEntry[];
  children: React.ReactNode;
}

/** Transition types with a visible single-stack treatment. */
const VISIBLE_TYPES = new Set([
  "whip_pan",
  "zoom_blur_cut",
  "glitch_cut",
  "crossfade",
  "slide",
  "morph_shape",
]);

function activeTransitionAt(
  transitions: TransitionEntry[],
  frame: number,
): TransitionEntry | null {
  for (const t of transitions) {
    if (!VISIBLE_TYPES.has(t.type)) continue;
    if (frame >= t.atFrame && frame < t.atFrame + t.durationInFrames) {
      return t;
    }
  }
  return null;
}

export const DirectorTransitionWrapper: React.FC<DirectorTransitionWrapperProps> = ({
  transitions,
  children,
}) => {
  const frame = useCurrentFrame();
  const active = activeTransitionAt(transitions ?? [], frame);

  if (!active) {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  const state = transitionStateAtFrame(
    frame,
    active.atFrame,
    active.durationInFrames,
    active.type,
    active.direction,
    active.easing,
  );

  // Single-stack rendering: the frame content is continuous across the cut, so
  // opacity dips to min(out,in)+shared floor rather than true cross-blending.
  const opacity =
    active.type === "crossfade" || active.type === "morph_shape"
      ? Math.max(state.outgoingOpacity, state.incomingOpacity)
      : 1;

  const transforms: string[] = [];
  if (state.translateXPct !== 0 || state.translateYPct !== 0) {
    transforms.push(
      `translate(${state.translateXPct}%, ${state.translateYPct}%)`,
    );
  }
  if (state.glitchOffsetPx !== 0) {
    transforms.push(`translateX(${state.glitchOffsetPx}px)`);
  }
  if (state.scale !== 1) {
    transforms.push(`scale(${state.scale})`);
  }

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: transforms.length ? transforms.join(" ") : undefined,
        filter: state.blurPx > 0 ? `blur(${state.blurPx}px)` : undefined,
      }}
    >
      {children}
      {state.glitchOffsetPx !== 0 ? (
        <AbsoluteFill
          style={{
            backgroundColor: "transparent",
            mixBlendMode: "screen",
            transform: `translateX(${-state.glitchOffsetPx * 2}px)`,
            opacity: 0.35,
          }}
        >
          {children}
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
