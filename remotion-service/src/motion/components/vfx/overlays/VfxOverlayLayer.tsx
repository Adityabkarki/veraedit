/**
 * Renders VFX overlay entries as actual composited layers (not math-only).
 */
import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import type { VFXOverlayEntry } from "@types/vfx";
import { vfxOverlayStateAtFrame } from "./vfxOverlayMath";

export interface VfxOverlayLayerProps {
  entries: VFXOverlayEntry[];
}

export const VfxOverlayLayer: React.FC<VfxOverlayLayerProps> = ({ entries }) => (
  <>
    {entries.map((entry) => (
      <Sequence
        key={entry.id}
        from={entry.startFrame}
        durationInFrames={entry.durationInFrames}
        layout="none"
      >
        <VfxOverlayInstance entry={entry} />
      </Sequence>
    ))}
  </>
);

const VfxOverlayInstance: React.FC<{ entry: VFXOverlayEntry }> = ({ entry }) => {
  const frame = useCurrentFrame();
  const state = vfxOverlayStateAtFrame(
    frame,
    entry.durationInFrames,
    entry.type,
    entry.intensity,
  );

  if (state.opacity <= 0.001) return null;

  switch (entry.type) {
    case "glitch":
      return (
        <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
          <AbsoluteFill
            style={{
              opacity: state.opacity,
              transform: `translateX(${state.translateXPct}%)`,
              background:
                "repeating-linear-gradient(90deg, rgba(255,0,0,0.15) 0 2px, transparent 2px 4px)",
            }}
          />
          <AbsoluteFill
            style={{
              opacity: state.opacity * 0.6,
              transform: `translateX(${-state.chromaticOffsetPx}px)`,
              boxShadow: `${state.chromaticOffsetPx}px 0 0 rgba(0,255,255,0.25)`,
            }}
          />
        </AbsoluteFill>
      );
    case "scanline":
      return (
        <AbsoluteFill
          style={{
            opacity: state.opacity,
            pointerEvents: "none",
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(0,0,0,0.35) 0 1px, transparent 1px 3px)",
            backgroundPosition: `0 ${state.scanlineOffset}px`,
          }}
        />
      );
    case "chromatic_aberration":
      return (
        <AbsoluteFill
          style={{
            opacity: state.opacity,
            pointerEvents: "none",
            boxShadow: `${state.chromaticOffsetPx}px 0 0 rgba(255,0,80,0.35), ${-state.chromaticOffsetPx}px 0 0 rgba(0,200,255,0.35)`,
          }}
        />
      );
    case "light_leak":
      return (
        <AbsoluteFill
          style={{
            opacity: state.opacity,
            pointerEvents: "none",
            mixBlendMode: "screen",
            background: `radial-gradient(ellipse at ${50 + state.translateXPct}% 20%, rgba(255,200,120,0.55), transparent 65%)`,
          }}
        />
      );
    case "halftone":
      return (
        <AbsoluteFill
          style={{
            opacity: state.opacity,
            pointerEvents: "none",
            mixBlendMode: "multiply",
            backgroundImage:
              "radial-gradient(circle, rgba(0,0,0,0.45) 1px, transparent 1px)",
            backgroundSize: "6px 6px",
          }}
        />
      );
    case "doodle":
      return (
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ opacity: state.opacity, pointerEvents: "none" }}
        >
          <path
            d="M8,72 Q25,40 42,58 T78,28"
            fill="none"
            stroke="rgba(255,255,255,0.65)"
            strokeWidth="0.6"
            strokeDasharray="4 2"
            strokeDashoffset={100 - (frame / Math.max(1, entry.durationInFrames)) * 100}
          />
        </svg>
      );
    default:
      return null;
  }
};
