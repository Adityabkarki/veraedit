/**
 * Corporate Timeline / Roadmap — SVG main axis path with circle nodes
 * and floating data-value text. Self-drawing strokeDashoffset.
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

export interface TimelineNode {
  label: string;
  value?: string;
}

export interface CorporateTimelineRoadmapProps {
  startSeconds?: number;
  endSeconds?: number;
  title?: string;
  nodes?: TimelineNode[];
}

const DEFAULT_NODES: TimelineNode[] = [
  { label: "2023", value: "Launch" },
  { label: "2024", value: "Scale" },
  { label: "2025", value: "Expand" },
  { label: "2026", value: "Lead" },
];

export const CorporateTimelineRoadmap: React.FC<CorporateTimelineRoadmapProps> = ({
  startSeconds = 0,
  endSeconds = 8,
  title = "Roadmap",
  nodes = DEFAULT_NODES,
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

  const steps = nodes.length ? nodes : DEFAULT_NODES;
  const mode = detectAspectMode(anim.width, anim.height);
  const safe = titleSafeRect(mode);
  const glide = curveConfig(theme.motion.defaultCurve);
  const n = steps.length;
  const vbW = 360;
  const vbH = Math.max(180, n * 56);
  const pathLen = vbH - 32;
  const draw = spring({
    frame: Math.round(anim.localSeconds * anim.fps),
    fps: anim.fps,
    config: glide,
  });
  const dashOffset = pathLen * (1 - Math.min(draw, 1));

  return (
    <div
      style={{
        position: "absolute",
        left: `${safe.left * 100}%`,
        bottom: `${safe.bottom * 100}%`,
        width: `${(1 - safe.left - safe.right) * 50}%`,
        opacity: anim.opacity,
        zIndex: ATOMIC_LAYER_DEPTH.corporate_timeline,
      }}
    >
      <div
        style={themeTypographyStyle(title, theme, {
          color: theme.colors.onSurface,
          fontSize: "0.95em",
          fontWeight: theme.typography.weightScale.heading,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: "2%",
        })}
      >
        {title}
      </div>
      <svg viewBox={`0 0 ${vbW} ${vbH}`} width="100%" style={{ overflow: "visible" }}>
        {steps.map((_, i) => {
          const y = 16 + i * ((vbH - 32) / Math.max(1, n - 1));
          return (
            <line
              key={`g-${i}`}
              x1={40}
              x2={340}
              y1={y}
              y2={y}
              stroke={withAlpha(brandColor, 0.3)}
              strokeWidth={1}
            />
          );
        })}
        <line
          x1={24}
          y1={16}
          x2={24}
          y2={vbH - 16}
          stroke={brandColor}
          strokeWidth={2}
          strokeDasharray={pathLen}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
        {steps.map((step, i) => {
          const y = 16 + i * ((vbH - 32) / Math.max(1, n - 1));
          const nodeIn = spring({
            frame: Math.max(0, Math.round((anim.localSeconds - i * 0.16) * anim.fps)),
            fps: anim.fps,
            config: glide,
          });
          const op = lerpClamp(nodeIn, [0, 1], [0, 1]);
          const isLast = i === n - 1;
          return (
            <g key={i} opacity={op}>
              <circle
                cx={24}
                cy={y}
                r={7}
                fill={isLast ? accentColor : theme.colors.background}
                stroke={isLast ? accentColor : brandColor}
                strokeWidth={2}
              />
              <text
                x={44}
                y={y + 5}
                fill={theme.colors.onSurface}
                fontSize={16}
                fontWeight={600}
                fontFamily={theme.typography.bodyFont}
              >
                {step.label}
                {step.value ? ` — ${step.value}` : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
