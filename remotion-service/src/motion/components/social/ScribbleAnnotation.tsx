/**
 * Scribble Attention Annotations — pre-compiled vector stroke paths
 * (arrows, circles, brackets) that self-trace via strokeDashoffset.
 * Physics: snappy_spring.
 */

import React from "react";
import { ATOMIC_LAYER_DEPTH } from "../layerDepth";
import { lerpClamp } from "../interpolateClamp";
import { useAtomicAnimation } from "../useAtomicAnimation";
import { themeTypographyStyle } from "@components/theme/themeTypography";
import { useTheme } from "@components/theme/ThemeProvider";
import { detectAspectMode, clampToTitleSafe } from "../safeZones";

export type ScribbleVariant = "arrow" | "circle" | "bracket";

export interface ScribbleAnnotationProps {
  startSeconds?: number;
  endSeconds?: number;
  variant?: ScribbleVariant;
  label?: string;
  xPct?: number;
  yPct?: number;
}

const PATHS: Record<ScribbleVariant, { d: string; len: number }> = {
  arrow: { d: "M 16 70 Q 80 18 170 62 L 150 48 M 170 62 L 148 78", len: 220 },
  circle: {
    d: "M 100 22 C 150 22 178 50 178 90 C 178 130 150 158 100 158 C 50 158 22 130 22 90 C 22 50 50 22 100 22",
    len: 360,
  },
  bracket: { d: "M 50 30 L 30 30 L 30 150 L 50 150 M 150 30 L 170 30 L 170 150 L 150 150", len: 280 },
};

export const ScribbleAnnotation: React.FC<ScribbleAnnotationProps> = ({
  startSeconds = 0,
  endSeconds = 6,
  variant = "arrow",
  label = "",
  xPct = 70,
  yPct = 40,
}) => {
  const theme = useTheme();
  const brandColor = theme.colors.accent;

  const anim = useAtomicAnimation({
    startSeconds,
    endSeconds,
    enterCurve: "snappy_spring",
    exitCurve: "snappy_spring",
    enterDurationSeconds: 0.35,
    exitDurationSeconds: 0.25,
  });
  if (!anim.active) return null;

  const mode = detectAspectMode(anim.width, anim.height);
  const pos = clampToTitleSafe(xPct, yPct, mode);
  const path = PATHS[variant] ?? PATHS.arrow;
  const draw = Math.min(anim.enter, 1);
  const dashOffset = path.len * (1 - draw);
  const labelOp = lerpClamp(anim.enter, [0.5, 1], [0, 1]) * anim.exit;

  return (
    <div
      style={{
        position: "absolute",
        left: `${pos.xPct}%`,
        top: `${pos.yPct}%`,
        width: "22%",
        transform: "translate(-50%, -50%)",
        opacity: anim.opacity,
        zIndex: ATOMIC_LAYER_DEPTH.scribble_annotation,
        filter: `drop-shadow(0 0 8px ${brandColor})`,
      }}
    >
      <svg viewBox="0 0 200 180" width="100%" style={{ overflow: "visible" }}>
        <path
          d={path.d}
          fill="none"
          stroke={brandColor}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={path.len}
          strokeDashoffset={dashOffset}
        />
      </svg>
      {label ? (
        <div
          style={themeTypographyStyle(label, theme, {
            color: theme.colors.onBackground,
            fontWeight: theme.typography.weightScale.heading,
            fontSize: "0.9em",
            textAlign: "center",
            marginTop: "-8%",
            opacity: labelOp,
          })}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
};
