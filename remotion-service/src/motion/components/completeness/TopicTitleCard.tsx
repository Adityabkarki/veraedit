/**
 * Topic Title Card — full-frame themed card for topic_shift B-roll fallback.
 */

import React from "react";
import { useAtomicAnimation } from "../useAtomicAnimation";
import { useTheme } from "@components/theme/ThemeProvider";
import { themeTypographyStyle } from "@components/theme/themeTypography";
import { withAlpha } from "@lib/theme/colorMath";
import { detectAspectMode, titleSafeRect } from "../safeZones";

export interface TopicTitleCardProps {
  startSeconds?: number;
  endSeconds?: number;
  label?: string;
  subtitle?: string;
}

export const TopicTitleCard: React.FC<TopicTitleCardProps> = ({
  startSeconds = 0,
  endSeconds = 5,
  label = "Topic",
  subtitle = "",
}) => {
  const theme = useTheme();
  const anim = useAtomicAnimation({
    startSeconds,
    endSeconds,
    enterCurve: theme.motion.defaultCurve,
    exitCurve: theme.motion.defaultCurve,
    enterDurationSeconds: 0.55,
    exitDurationSeconds: 0.35,
  });
  if (!anim.active) return null;

  const mode = detectAspectMode(anim.width, anim.height);
  const safe = titleSafeRect(mode);
  const drift = Math.sin(anim.localSeconds * 0.8) * 4;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: anim.opacity,
        zIndex: 20,
        background: `linear-gradient(135deg, ${withAlpha(theme.colors.background, 0.92)} 0%, ${withAlpha(theme.colors.surface, 0.88)} 100%)`,
      }}
    >
      <div
        style={{
          transform: `translateY(${drift}px) scale(${0.94 + anim.enter * 0.06})`,
          textAlign: "center",
          maxWidth: `${(1 - safe.left - safe.right) * 100}%`,
          padding: "4% 6%",
          borderRadius: 20,
          border: `1px solid ${withAlpha(theme.colors.accent, 0.35)}`,
          boxShadow: `0 24px 64px ${withAlpha(theme.colors.background, 0.45)}`,
        }}
      >
        <div
          style={themeTypographyStyle(label, theme, {
            color: theme.colors.onBackground,
            fontSize: "2.4em",
            fontWeight: theme.typography.weightScale.heading,
            lineHeight: 1.15,
          })}
        >
          {label}
        </div>
        {subtitle ? (
          <div
            style={themeTypographyStyle(subtitle, theme, {
              color: withAlpha(theme.colors.onBackground, 0.75),
              fontSize: "1.1em",
              marginTop: "0.6em",
            })}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
};
