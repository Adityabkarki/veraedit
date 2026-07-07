/**
 * Icon Point Callout — small animated icon + label for key points.
 */

import React from "react";
import { useAtomicAnimation } from "../useAtomicAnimation";
import { useTheme } from "@components/theme/ThemeProvider";
import { themeTypographyStyle } from "@components/theme/themeTypography";
import { glassSurfaceStyle } from "@lib/theme/glassStyles";
import { withAlpha } from "@lib/theme/colorMath";
import { lerpClamp } from "../interpolateClamp";

export interface IconPointCalloutProps {
  startSeconds?: number;
  endSeconds?: number;
  label?: string;
  icon?: "star" | "check" | "bolt";
  xPct?: number;
  yPct?: number;
}

const ICON_PATHS: Record<string, string> = {
  star: "M12 2 L15 9 L22 9 L16.5 13.5 L18 21 L12 17 L6 21 L7.5 13.5 L2 9 L9 9 Z",
  check: "M4 12 L9 17 L20 6",
  bolt: "M13 2 L4 14 L11 14 L9 22 L20 10 L13 10 Z",
};

export const IconPointCallout: React.FC<IconPointCalloutProps> = ({
  startSeconds = 0,
  endSeconds = 3,
  label = "Key point",
  icon = "star",
  xPct = 18,
  yPct = 32,
}) => {
  const theme = useTheme();
  const anim = useAtomicAnimation({
    startSeconds,
    endSeconds,
    enterCurve: theme.motion.defaultCurve,
    exitCurve: theme.motion.defaultCurve,
    enterDurationSeconds: 0.4,
    exitDurationSeconds: 0.25,
  });
  if (!anim.active) return null;

  const slideX = lerpClamp(anim.enter, [0, 1], [-24, 0]);
  const path = ICON_PATHS[icon] ?? ICON_PATHS.star;

  return (
    <div
      style={{
        position: "absolute",
        left: `${xPct}%`,
        top: `${yPct}%`,
        transform: `translate(-50%, -50%) translateX(${slideX}px)`,
        opacity: anim.opacity,
        zIndex: 62,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0.8em 1.2em",
        borderRadius: 14,
        ...glassSurfaceStyle(theme),
      }}
    >
      <svg width={28} height={28} viewBox="0 0 24 24" fill="none">
        <path
          d={path}
          stroke={theme.colors.accent}
          strokeWidth={2}
          strokeLinejoin="round"
          fill={withAlpha(theme.colors.accent, 0.15)}
        />
      </svg>
      <div
        style={themeTypographyStyle(label, theme, {
          color: theme.colors.onSurface,
          fontSize: "1em",
          fontWeight: 600,
        })}
      >
        {label}
      </div>
    </div>
  );
};
