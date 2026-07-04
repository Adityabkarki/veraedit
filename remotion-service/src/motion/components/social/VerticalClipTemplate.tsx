/**
 * Vertical Clip Templates (9:16) — auto-caption layout presets on responsive
 * primitives so nothing breaks when aspect ratio flips.
 * Respects social safe zones (bottom 15%, right 10%).
 */

import React from "react";
import { AbsoluteFill } from "remotion";
import { ATOMIC_LAYER_DEPTH } from "../layerDepth";
import { useAtomicAnimation } from "../useAtomicAnimation";
import { themeTypographyStyle } from "@components/theme/themeTypography";
import { useTheme } from "@components/theme/ThemeProvider";
import { withAlpha } from "@lib/theme/colorMath";
import {
  actionSafeRect,
  detectAspectMode,
  titleSafeRect,
  safeRectStyle,
} from "../safeZones";
import { KineticKaraokeText } from "./KineticKaraokeText";
import { BrandWordmark } from "@components/theme/BrandWordmark";

export interface VerticalClipTemplateProps {
  startSeconds?: number;
  endSeconds?: number;
  platform?: string;
  caption?: string;
  showSafeGuides?: boolean;
}

export const VerticalClipTemplate: React.FC<VerticalClipTemplateProps> = ({
  startSeconds = 0,
  endSeconds = 8,
  platform = "tiktok",
  caption = "Hook line that keeps them watching",
  showSafeGuides = false,
}) => {
  const theme = useTheme();

  const anim = useAtomicAnimation({
    startSeconds,
    endSeconds,
    enterCurve: "snappy_spring",
    exitCurve: "snappy_spring",
    enterDurationSeconds: 0.3,
    exitDurationSeconds: 0.25,
  });
  if (!anim.active) return null;

  const mode = detectAspectMode(anim.width, anim.height);
  const action = actionSafeRect(mode);
  const title = titleSafeRect(mode);

  return (
    <AbsoluteFill
      style={{
        opacity: anim.opacity,
        pointerEvents: "none",
        zIndex: ATOMIC_LAYER_DEPTH.vertical_clip_template,
      }}
    >
      <div
        style={{
          ...safeRectStyle(action),
          border: `2px solid ${withAlpha(theme.colors.primary, 0.27)}`,
          borderRadius: mode === "social_9_16" ? "4%" : "1.5%",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: `${title.top * 100}%`,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.4em",
        }}
      >
        <div
          style={themeTypographyStyle(platform, theme, {
            fontSize: "0.75em",
            fontWeight: theme.typography.weightScale.heading,
            letterSpacing: "0.14em",
            color: theme.colors.onBackground,
            background: withAlpha(theme.colors.background, 0.45),
            padding: "0.35em 0.9em",
            borderRadius: 999,
            textTransform: "uppercase",
          })}
        >
          {platform}
        </div>
        <div style={{ height: "1.2em", maxWidth: "30%" }}>
          <BrandWordmark />
        </div>
      </div>

      <KineticKaraokeText
        startSeconds={startSeconds}
        endSeconds={endSeconds}
        text={caption}
      />

      {showSafeGuides ? (
        <div
          style={{
            ...safeRectStyle(title),
            border: `1px dashed ${withAlpha(theme.colors.primary, 0.35)}`,
            zIndex: ATOMIC_LAYER_DEPTH.safe_zone_guide,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
