/**
 * Symmetric Audio Strip — bars expand outward from a center point.
 * Anchored to bottom third (not centered textually). Pill edges, glow.
 * Graceful degradation: missing amplitude → seeded Math.sin(frame) loop.
 */

import React from "react";
import { ATOMIC_LAYER_DEPTH } from "../layerDepth";
import { useAtomicAnimation } from "../useAtomicAnimation";
import { withAlpha } from "@lib/theme/colorMath";
import { useTheme } from "@components/theme/ThemeProvider";
import type { AudioAnalysisTrack } from "@types/audio-analysis";
import { resolveEqualizerBands } from "@lib/audio/mockFallback";

export interface SymmetricAudioStripProps {
  startSeconds?: number;
  endSeconds?: number;
  brandColor?: string;
  accentColor?: string;
  bars?: number;
  seed?: number;
  /** @deprecated Use audioAnalysis — kept for legacy plan JSON. */
  amplitudes?: number[];
  audioAnalysis?: AudioAnalysisTrack | null;
  isMockData?: boolean;
}

export const SymmetricAudioStrip: React.FC<SymmetricAudioStripProps> = ({
  startSeconds = 0,
  endSeconds = 8,
  brandColor: brandColorProp,
  accentColor: accentColorProp,
  bars = 28,
  seed = 4,
  amplitudes,
  audioAnalysis,
  isMockData: isMockDataProp,
}) => {
  const theme = useTheme();
  const brandColor = brandColorProp ?? theme.colors.primary;
  const accentColor = accentColorProp ?? theme.colors.accent;

  const anim = useAtomicAnimation({
    startSeconds,
    endSeconds,
    enterCurve: theme.motion.defaultCurve,
    exitCurve: theme.motion.defaultCurve,
    enterDurationSeconds: 0.35,
    exitDurationSeconds: 0.3,
  });
  if (!anim.active) return null;

  const count = Math.max(8, Math.min(48, bars));
  const half = Math.floor(count / 2);
  const maxH = 72;
  const enter = Math.min(anim.enter, 1);

  const legacyAnalysis =
    amplitudes && amplitudes.length > 0
      ? { frames: [{ frame: anim.frame, bands: amplitudes }] }
      : null;

  const { bands: barHeights, isMockData } = resolveEqualizerBands(
    anim.frame,
    count,
    seed,
    audioAnalysis ?? legacyAnalysis,
  );
  const usingMock = isMockDataProp ?? isMockData;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: "6%",
        transform: "translateX(-50%)",
        opacity: anim.opacity,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: 4,
        height: maxH,
        width: "55%",
        zIndex: ATOMIC_LAYER_DEPTH.symmetric_audio_strip,
        filter: `drop-shadow(0 0 15px ${withAlpha(accentColor, 0.85)})`,
      }}
      data-audio-reactive={usingMock ? "mock" : "real"}
      data-is-mock-data={usingMock ? "true" : "false"}
    >
      {Array.from({ length: count }).map((_, i) => {
        const dist = Math.abs(i - (count - 1) / 2) / Math.max(1, half);
        const amp = barHeights[i] ?? 0.3;
        const envelope = 1 - dist * 0.35;
        const h = Math.max(6, amp * envelope * maxH * enter);

        return (
          <div
            key={i}
            style={{
              width: 6,
              height: h,
              borderRadius: 999,
              background: `linear-gradient(180deg, ${accentColor}, ${brandColor})`,
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
};
