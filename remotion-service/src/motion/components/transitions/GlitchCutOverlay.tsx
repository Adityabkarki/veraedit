/**
 * Glitch cut overlay — RGB channel split via feColorMatrix offsets.
 * Photosensitive Flash Safety: capped at GLITCH_MAX_FRAMES, low contrast shift.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { TransitionEntry } from "@types/transitions";
import { transitionStateAtFrame } from "./transitionMath";

export interface GlitchCutOverlayProps {
  transition: TransitionEntry;
  children: React.ReactNode;
}

export const GlitchCutOverlay: React.FC<GlitchCutOverlayProps> = ({ transition, children }) => {
  const frame = useCurrentFrame();
  const state = transitionStateAtFrame(
    frame,
    transition.atFrame,
    transition.durationInFrames,
    "glitch_cut",
    transition.direction,
    transition.easing,
  );

  if (state.incomingOpacity >= 1 && state.outgoingOpacity <= 0) {
    return <>{children}</>;
  }

  const offset = state.glitchOffsetPx;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transform: `translateX(${offset}px)`,
          filter: "url(#glitch-red)",
          opacity: state.outgoingOpacity,
        }}
      >
        {children}
      </AbsoluteFill>
      <svg width="0" height="0" aria-hidden>
        <filter id="glitch-red">
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
          />
        </filter>
      </svg>
    </AbsoluteFill>
  );
};
