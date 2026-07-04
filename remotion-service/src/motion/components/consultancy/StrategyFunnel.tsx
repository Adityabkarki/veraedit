/**
 * Self-Assembling Strategy Funnel — stacked trapezoidal SVG shapes.
 * strokeDashoffset self-draws top→bottom; side-text title reveal.
 * Physics: elegant_glide only.
 */

import React from "react";
import { spring } from "remotion";
import { ATOMIC_LAYER_DEPTH } from "../layerDepth";
import { lerpClamp } from "../interpolateClamp";
import { useAtomicAnimation } from "../useAtomicAnimation";
import { themeTypographyStyle } from "@components/theme/themeTypography";
import { useTheme } from "@components/theme/ThemeProvider";
import { curveConfig } from "../physics";
import { withAlpha } from "@lib/theme/colorMath";
import { detectAspectMode, titleSafeRect } from "../safeZones";

export interface FunnelPhase {
  label: string;
  value?: number;
}

export interface StrategyFunnelProps {
  startSeconds?: number;
  endSeconds?: number;
  phases?: FunnelPhase[];
}

const DEFAULT_PHASES: FunnelPhase[] = [
  { label: "Awareness", value: 100 },
  { label: "Interest", value: 68 },
  { label: "Decision", value: 40 },
  { label: "Convert", value: 18 },
];

function trapPath(
  y: number,
  h: number,
  topW: number,
  botW: number,
  cx: number,
): string {
  const t0 = cx - topW / 2;
  const t1 = cx + topW / 2;
  const b0 = cx - botW / 2;
  const b1 = cx + botW / 2;
  return `M ${t0} ${y} L ${t1} ${y} L ${b1} ${y + h} L ${b0} ${y + h} Z`;
}

export const StrategyFunnel: React.FC<StrategyFunnelProps> = ({
  startSeconds = 0,
  endSeconds = 8,
  phases = DEFAULT_PHASES,
}) => {
  const theme = useTheme();
  const brandColor = theme.colors.secondary;
  const accentColor = theme.colors.accent;

  const anim = useAtomicAnimation({
    startSeconds,
    endSeconds,
    enterCurve: theme.motion.defaultCurve,
    exitCurve: theme.motion.defaultCurve,
    enterDurationSeconds: 0.5,
    exitDurationSeconds: 0.35,
  });
  if (!anim.active) return null;

  const steps = phases.length ? phases : DEFAULT_PHASES;
  const mode = detectAspectMode(anim.width, anim.height);
  const safe = titleSafeRect(mode);
  const glide = curveConfig(theme.motion.defaultCurve);
  const vbW = 400;
  const vbH = 320;
  const cx = 160;
  const n = steps.length;
  const rowH = (vbH - 40) / n;

  return (
    <div
      style={{
        position: "absolute",
        left: `${safe.left * 100}%`,
        top: `${safe.top * 100}%`,
        width: `${(1 - safe.left - safe.right) * 55}%`,
        opacity: anim.opacity,
        zIndex: ATOMIC_LAYER_DEPTH.strategy_funnel,
      }}
    >
      <svg viewBox={`0 0 ${vbW} ${vbH}`} width="100%" style={{ overflow: "visible" }}>
        {steps.map((phase, i) => {
          const stagger = i * 0.22;
          const draw = spring({
            frame: Math.max(0, Math.round((anim.localSeconds - stagger) * anim.fps)),
            fps: anim.fps,
            config: glide,
          });
          const y = 20 + i * rowH;
          const topW = 220 - i * 36;
          const botW = 220 - (i + 1) * 36;
          const d = trapPath(y, rowH - 8, topW, botW, cx);
          const pathLen = topW + botW + 2 * Math.hypot(18, rowH);
          const dashOffset = pathLen * (1 - Math.min(draw, 1));
          const fill = i === n - 1 ? accentColor : brandColor;
          const labelOpacity = lerpClamp(draw, [0.4, 1], [0, 1]);

          return (
            <g key={i}>
              <path
                d={d}
                fill={withAlpha(fill, 0.2)}
                stroke={fill}
                strokeWidth={2}
                strokeDasharray={pathLen}
                strokeDashoffset={dashOffset}
                strokeLinejoin="round"
              />
              <text
                x={cx + topW / 2 + 24}
                y={y + rowH / 2 + 4}
                fill={theme.colors.onSurface}
                fontSize={16}
                fontWeight={theme.typography.weightScale.heading}
                fontFamily={theme.typography.bodyFont}
                opacity={labelOpacity}
              >
                {phase.label}
                {phase.value != null ? `  ${phase.value}` : ""}
              </text>
            </g>
          );
        })}
      </svg>
      <div
        style={themeTypographyStyle("Strategy Funnel", theme, {
          position: "absolute",
          top: "-8%",
          left: 0,
          color: withAlpha(theme.colors.onSurface, 0.65),
          fontSize: "0.75em",
          fontWeight: theme.typography.weightScale.heading,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        })}
      >
        Strategy Funnel
      </div>
    </div>
  );
};
