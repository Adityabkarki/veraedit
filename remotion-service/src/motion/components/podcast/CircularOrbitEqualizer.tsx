/**
 * Circular Orbit Equalizer — bars wrap radially around a speaker profile mask.
 * SVG path geometry via viewBox (aspect-ratio safe). Glow + rounded caps.
 */

import React from "react";
import { ATOMIC_LAYER_DEPTH } from "../layerDepth";
import { lerpClamp } from "../interpolateClamp";
import { useAtomicAnimation } from "../useAtomicAnimation";
import { withAlpha } from "@lib/theme/colorMath";
import { useTheme } from "@components/theme/ThemeProvider";
import type { AudioAnalysisTrack } from "@types/audio-analysis";
import { resolveEqualizerBands } from "@lib/audio/mockFallback";

export interface CircularOrbitEqualizerProps {
  startSeconds?: number;
  endSeconds?: number;
  brandColor?: string;
  accentColor?: string;
  spokes?: number;
  seed?: number;
  /** @deprecated Use audioAnalysis — kept for legacy plan JSON. */
  amplitudes?: number[];
  audioAnalysis?: AudioAnalysisTrack | null;
  /** Dev flag — true when mock sin loop is active (Graceful Degradation). */
  isMockData?: boolean;
  profileSrc?: string;
  monogram?: string;
  xPct?: number;
  yPct?: number;
  sizePct?: number;
}

export const CircularOrbitEqualizer: React.FC<CircularOrbitEqualizerProps> = ({
  startSeconds = 0,
  endSeconds = 8,
  brandColor: brandColorProp,
  accentColor: accentColorProp,
  spokes = 36,
  seed = 7,
  amplitudes,
  audioAnalysis,
  isMockData: isMockDataProp,
  profileSrc,
  monogram = "A",
  xPct = 50,
  yPct = 42,
  sizePct = 28,
}) => {
  const theme = useTheme();
  const brandColor = brandColorProp ?? theme.colors.primary;
  const accentColor = accentColorProp ?? theme.colors.accent;

  const anim = useAtomicAnimation({
    startSeconds,
    endSeconds,
    enterCurve: theme.motion.defaultCurve,
    exitCurve: theme.motion.defaultCurve,
    enterDurationSeconds: 0.4,
    exitDurationSeconds: 0.3,
  });
  if (!anim.active) return null;

  const count = Math.max(16, Math.min(64, spokes));
  const vb = 200;
  const cx = 100;
  const cy = 100;
  const r = 52;
  const enter = Math.min(anim.enter, 1);
  const scale = lerpClamp(enter, [0, 1], [0.85, 1]);

  const legacyAnalysis =
    amplitudes && amplitudes.length > 0
      ? {
          frames: [
            {
              frame: anim.frame,
              bands: amplitudes,
            },
          ],
        }
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
        left: `${xPct}%`,
        top: `${yPct}%`,
        width: `${sizePct}%`,
        aspectRatio: "1",
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity: anim.opacity,
        zIndex: ATOMIC_LAYER_DEPTH.circular_orbit_equalizer,
        filter: `drop-shadow(0 0 14px ${withAlpha(brandColor, 0.7)})`,
      }}
      data-audio-reactive={usingMock ? "mock" : "real"}
      data-is-mock-data={usingMock ? "true" : "false"}
    >
      <svg
        viewBox={`0 0 ${vb} ${vb}`}
        width="100%"
        height="100%"
        style={{ overflow: "visible" }}
      >
        <defs>
          <clipPath id="orbit-profile-clip">
            <circle cx={cx} cy={cy} r={r - 10} />
          </clipPath>
        </defs>
        <circle
          cx={cx}
          cy={cy}
          r={r - 8}
          fill="none"
          stroke={withAlpha(brandColor, 0.2)}
          strokeWidth={2}
        />
        {Array.from({ length: count }).map((_, i) => {
          const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
          const wave = barHeights[i] ?? 0.3;
          const len = (10 + wave * 34) * enter;
          const x1 = cx + Math.cos(angle) * r;
          const y1 = cy + Math.sin(angle) * r;
          const x2 = cx + Math.cos(angle) * (r + len);
          const y2 = cy + Math.sin(angle) * (r + len);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={i % 2 === 0 ? accentColor : brandColor}
              strokeWidth={4}
              strokeLinecap="round"
            />
          );
        })}
        <circle
          cx={cx}
          cy={cy}
          r={r - 10}
          fill={withAlpha(theme.colors.background, 0.92)}
          stroke={brandColor}
          strokeWidth={2}
        />
        {profileSrc ? (
          <image
            href={profileSrc}
            x={cx - (r - 10)}
            y={cy - (r - 10)}
            width={(r - 10) * 2}
            height={(r - 10) * 2}
            clipPath="url(#orbit-profile-clip)"
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <text
            x={cx}
            y={cy + 8}
            textAnchor="middle"
            fill={brandColor}
            fontSize={28}
            fontWeight={theme.typography.weightScale.heading}
            fontFamily={theme.typography.headingFont}
          >
            {monogram.slice(0, 2)}
          </text>
        )}
      </svg>
    </div>
  );
};
