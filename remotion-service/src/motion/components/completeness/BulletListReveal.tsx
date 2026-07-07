/**
 * Bullet List Reveal — sequential animated list items (elegant_glide).
 */

import React from "react";
import { spring } from "remotion";
import { useAtomicAnimation } from "../useAtomicAnimation";
import { useTheme } from "@components/theme/ThemeProvider";
import { themeTypographyStyle } from "@components/theme/themeTypography";
import { withAlpha } from "@lib/theme/colorMath";
import { curveConfig } from "../physics";
import { detectAspectMode, titleSafeRect } from "../safeZones";

export interface BulletListRevealProps {
  startSeconds?: number;
  endSeconds?: number;
  title?: string;
  items?: string[];
}

export const BulletListReveal: React.FC<BulletListRevealProps> = ({
  startSeconds = 0,
  endSeconds = 6,
  title = "Key points",
  items = ["First point", "Second point", "Third point"],
}) => {
  const theme = useTheme();
  const anim = useAtomicAnimation({
    startSeconds,
    endSeconds,
    enterCurve: theme.motion.defaultCurve,
    exitCurve: theme.motion.defaultCurve,
    enterDurationSeconds: 0.5,
    exitDurationSeconds: 0.35,
  });
  if (!anim.active) return null;

  const mode = detectAspectMode(anim.width, anim.height);
  const safe = titleSafeRect(mode);
  const glide = curveConfig(theme.motion.defaultCurve);
  const list = items.length ? items : ["Point one"];

  return (
    <div
      style={{
        position: "absolute",
        left: `${safe.left * 100}%`,
        top: `${safe.top * 100 + 8}%`,
        width: `${(1 - safe.left - safe.right) * 55}%`,
        opacity: anim.opacity,
        zIndex: 32,
      }}
    >
      <div
        style={themeTypographyStyle(title, theme, {
          color: theme.colors.onBackground,
          fontSize: "1.4em",
          fontWeight: theme.typography.weightScale.heading,
          marginBottom: "0.8em",
        })}
      >
        {title}
      </div>
      {list.map((item, i) => {
        const delay = i * 0.18;
        const local = Math.max(0, anim.localSeconds - delay);
        const reveal = spring({
          frame: Math.round(local * anim.fps),
          fps: anim.fps,
          config: glide,
        });
        return (
          <div
            key={`${i}-${item}`}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              marginBottom: "0.55em",
              opacity: Math.min(reveal, 1) * anim.opacity,
              transform: `translateX(${(1 - Math.min(reveal, 1)) * -20}px)`,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                marginTop: 8,
                background: theme.colors.primary,
                boxShadow: `0 0 12px ${withAlpha(theme.colors.primary, 0.5)}`,
              }}
            />
            <div
              style={themeTypographyStyle(item, theme, {
                color: theme.colors.onBackground,
                fontSize: "1.15em",
                lineHeight: 1.35,
              })}
            >
              {item}
            </div>
          </div>
        );
      })}
    </div>
  );
};
