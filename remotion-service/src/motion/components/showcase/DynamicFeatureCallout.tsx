/**
 * Dynamic Feature Callouts — blinking anchor-dot linked to a floating
 * description card via expanding pointer stroke.
 * Physics: elastic_overshoot locked per manifest (product showcase).
 */

import React from "react";
import { spring } from "remotion";
import { ATOMIC_LAYER_DEPTH } from "../layerDepth";
import { lerpClamp } from "../interpolateClamp";
import { useAtomicAnimation } from "../useAtomicAnimation";
import { themeTypographyStyle } from "@components/theme/themeTypography";
import { useTheme } from "@components/theme/ThemeProvider";
import { curveConfig } from "../physics";
import { glassCardStyle } from "@lib/theme/glassStyles";
import { withAlpha } from "@lib/theme/colorMath";
import { detectAspectMode, clampToTitleSafe } from "../safeZones";

export interface DynamicFeatureCalloutProps {
  startSeconds?: number;
  endSeconds?: number;
  text?: string;
  xPct?: number;
  yPct?: number;
  lineLengthPct?: number;
  angleDeg?: number;
}

export const DynamicFeatureCallout: React.FC<DynamicFeatureCalloutProps> = ({
  startSeconds = 0,
  endSeconds = 8,
  text = "Key feature",
  xPct = 62,
  yPct = 40,
  lineLengthPct = 14,
  angleDeg = -18,
}) => {
  const theme = useTheme();
  const brandColor = theme.colors.accent;

  const anim = useAtomicAnimation({
    startSeconds,
    endSeconds,
    enterCurve: "elastic_overshoot",
    exitCurve: "snappy_spring",
    enterDurationSeconds: 0.5,
    exitDurationSeconds: 0.3,
  });
  if (!anim.active) return null;

  const mode = detectAspectMode(anim.width, anim.height);
  const pos = clampToTitleSafe(xPct, yPct, mode);
  const elastic = curveConfig("elastic_overshoot");

  const lineProgress = lerpClamp(anim.enter, [0, 0.55], [0, 1]);
  const cardDelay = 0.22;
  const cardSpring = spring({
    frame: Math.max(0, Math.round((anim.localSeconds - cardDelay) * anim.fps)),
    fps: anim.fps,
    config: elastic,
  });
  const cardOp = lerpClamp(cardSpring, [0, 1], [0, 1]) * anim.exit;
  const cardScale = lerpClamp(cardSpring, [0, 1], [0.85, 1]);

  const blinkHz = 2.5;
  const blink =
    0.55 +
    0.45 * Math.abs(Math.sin(anim.localSeconds * Math.PI * 2 * blinkHz));

  return (
    <div
      style={{
        position: "absolute",
        left: `${pos.xPct}%`,
        top: `${pos.yPct}%`,
        transform: `translate(-50%, -50%) rotate(${angleDeg}deg)`,
        opacity: anim.opacity,
        zIndex: ATOMIC_LAYER_DEPTH.dynamic_feature_callout,
        display: "flex",
        alignItems: "center",
        gap: "0.4em",
      }}
    >
      <div
        style={{
          width: "0.7em",
          height: "0.7em",
          borderRadius: "50%",
          background: brandColor,
          opacity: blink,
          boxShadow: `0 0 12px ${withAlpha(brandColor, 0.9)}`,
          flexShrink: 0,
        }}
      />

      <div
        style={{
          width: `${lineLengthPct * lineProgress}vw`,
          height: 2,
          background: brandColor,
          borderRadius: 1,
          transformOrigin: "left center",
          flexShrink: 0,
        }}
      />

      <div
        style={{
          opacity: cardOp,
          transform: `rotate(${-angleDeg}deg) scale(${cardScale})`,
          padding: "0.4em 0.75em",
          borderRadius: 10,
          ...glassCardStyle(theme),
        }}
      >
        <div
          style={themeTypographyStyle(text, theme, {
            color: theme.colors.onSurface,
            fontWeight: theme.typography.weightScale.heading,
            fontSize: "0.95em",
            whiteSpace: "nowrap",
          })}
        >
          {text}
        </div>
      </div>
    </div>
  );
};
