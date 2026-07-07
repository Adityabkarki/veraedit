/**
 * Pull-Quote Card — full-frame styled quote for high_emphasis_moment fallback.
 */

import React from "react";
import { useAtomicAnimation } from "../useAtomicAnimation";
import { useTheme } from "@components/theme/ThemeProvider";
import { themeTypographyStyle } from "@components/theme/themeTypography";
import { withAlpha } from "@lib/theme/colorMath";
import { detectAspectMode, titleSafeRect } from "../safeZones";

export interface PullQuoteCardProps {
  startSeconds?: number;
  endSeconds?: number;
  text?: string;
  attribution?: string;
}

export const PullQuoteCard: React.FC<PullQuoteCardProps> = ({
  startSeconds = 0,
  endSeconds = 4,
  text = "",
  attribution = "",
}) => {
  const theme = useTheme();
  const anim = useAtomicAnimation({
    startSeconds,
    endSeconds,
    enterCurve: theme.motion.defaultCurve,
    exitCurve: theme.motion.defaultCurve,
    enterDurationSeconds: 0.5,
    exitDurationSeconds: 0.3,
  });
  if (!anim.active) return null;

  const mode = detectAspectMode(anim.width, anim.height);
  const safe = titleSafeRect(mode);
  const quote = text.trim() || "Key moment";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: anim.opacity,
        zIndex: 58,
        padding: `${safe.top * 100}% ${safe.right * 100}% ${safe.bottom * 100}% ${safe.left * 100}%`,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "78%",
          padding: "5% 6%",
          borderLeft: `6px solid ${theme.colors.primary}`,
          background: withAlpha(theme.colors.surface, 0.82),
          borderRadius: 12,
          transform: `translateY(${(1 - anim.enter) * 16}px)`,
        }}
      >
        <div
          style={themeTypographyStyle("“", theme, {
            color: theme.colors.accent,
            fontSize: "3em",
            lineHeight: 0.6,
            marginBottom: "0.2em",
          })}
        >
          “
        </div>
        <div
          style={themeTypographyStyle(quote, theme, {
            color: theme.colors.onSurface,
            fontSize: "1.65em",
            fontWeight: 600,
            lineHeight: 1.35,
          })}
        >
          {quote}
        </div>
        {attribution ? (
          <div
            style={themeTypographyStyle(attribution, theme, {
              color: withAlpha(theme.colors.onSurface, 0.7),
              fontSize: "0.95em",
              marginTop: "1em",
            })}
          >
            — {attribution}
          </div>
        ) : null}
      </div>
    </div>
  );
};
