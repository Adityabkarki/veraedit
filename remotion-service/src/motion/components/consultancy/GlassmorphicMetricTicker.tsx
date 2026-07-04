/**
 * Glassmorphic Metric Tickers — backdrop-blur, translucent plate,
 * title + count-up number + trend arrow vector.
 * Physics: elegant_glide.
 */

import React from "react";
import { ATOMIC_LAYER_DEPTH } from "../layerDepth";
import { lerpClamp } from "../interpolateClamp";
import { useAtomicAnimation } from "../useAtomicAnimation";
import { themeTypographyStyle } from "@components/theme/themeTypography";
import { useTheme } from "@components/theme/ThemeProvider";
import { glassSurfaceStyle } from "@lib/theme/glassStyles";
import { withAlpha } from "@lib/theme/colorMath";
import { detectAspectMode, clampToTitleSafe } from "../safeZones";

export interface GlassmorphicMetricTickerProps {
  startSeconds?: number;
  endSeconds?: number;
  title?: string;
  value?: number;
  prefix?: string;
  suffix?: string;
  /** Positive = up, negative = down, 0 = flat. */
  trend?: number;
  xPct?: number;
  yPct?: number;
}

export const GlassmorphicMetricTicker: React.FC<GlassmorphicMetricTickerProps> = ({
  startSeconds = 0,
  endSeconds = 8,
  title = "Revenue",
  value = 12840,
  prefix = "",
  suffix = "",
  trend = 1,
  xPct = 72,
  yPct = 28,
}) => {
  const theme = useTheme();

  const anim = useAtomicAnimation({
    startSeconds,
    endSeconds,
    enterCurve: theme.motion.defaultCurve,
    exitCurve: theme.motion.defaultCurve,
    enterDurationSeconds: 0.45,
    exitDurationSeconds: 0.3,
  });
  if (!anim.active) return null;

  const mode = detectAspectMode(anim.width, anim.height);
  const pos = clampToTitleSafe(xPct, yPct, mode);
  const progress = Math.min(anim.enter, 1);
  const display = Math.round(value * progress);
  const trendColor =
    trend > 0
      ? theme.colors.accent
      : trend < 0
        ? theme.colors.primary
        : theme.colors.secondary;
  const arrowPath =
    trend > 0 ? "M4 14 L12 4 L20 14" : trend < 0 ? "M4 6 L12 16 L20 6" : "M4 10 L20 10";
  const slideY = lerpClamp(anim.enter, [0, 1], [18, 0]);

  return (
    <div
      style={{
        position: "absolute",
        left: `${pos.xPct}%`,
        top: `${pos.yPct}%`,
        transform: `translate(-50%, -50%) translateY(${slideY}px)`,
        opacity: anim.opacity,
        zIndex: ATOMIC_LAYER_DEPTH.metric_ticker,
        minWidth: "18%",
        maxWidth: "32%",
        padding: "1.2% 1.6%",
        borderRadius: 16,
        ...glassSurfaceStyle(theme),
      }}
    >
      <div
        style={themeTypographyStyle(title, theme, {
          color: withAlpha(theme.colors.onSurface, 0.85),
          fontSize: "0.85em",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        })}
      >
        {title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8%" }}>
        <div
          style={themeTypographyStyle(`${display}`, theme, {
            color: theme.colors.onSurface,
            fontSize: "1.8em",
            fontWeight: theme.typography.weightScale.heading,
            fontVariantNumeric: "tabular-nums",
          })}
        >
          {prefix}
          {display.toLocaleString()}
          {suffix}
        </div>
        <svg
          viewBox="0 0 24 20"
          width="18%"
          style={{ maxWidth: 28, overflow: "visible" }}
        >
          <path
            d={arrowPath}
            fill="none"
            stroke={trendColor}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={40}
            strokeDashoffset={40 * (1 - progress)}
          />
        </svg>
      </div>
    </div>
  );
};
