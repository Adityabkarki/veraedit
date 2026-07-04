/**
 * Kinetic Karaoke Text — inline-block word nodes.
 * On spoken frame: scale +15% with snappy_spring + neon accent flash.
 * Layout smoothing via flex gap spring. Devanagari-safe typography.
 * Physics: snappy_spring locked per manifest (karaoke pop).
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

export interface KaraokeWord {
  text: string;
  startSeconds: number;
}

export interface KineticKaraokeTextProps {
  startSeconds?: number;
  endSeconds?: number;
  text?: string;
  words?: KaraokeWord[];
}

export const KineticKaraokeText: React.FC<KineticKaraokeTextProps> = ({
  startSeconds = 0,
  endSeconds = 8,
  text = "Your words light up here",
  words,
}) => {
  const theme = useTheme();
  const color = theme.colors.onBackground;
  const accentColor = theme.colors.accent;

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
  const safe = titleSafeRect(mode);
  const snappy = curveConfig("snappy_spring");

  const tokens: KaraokeWord[] =
    words && words.length
      ? words
      : text
          .split(/\s+/)
          .filter(Boolean)
          .map((w, i) => ({
            text: w,
            startSeconds: startSeconds + 0.12 + i * 0.18,
          }));

  const gap = lerpClamp(anim.enter, [0, 1], [0, 10]);

  return (
    <div
      style={{
        position: "absolute",
        left: `${safe.left * 100}%`,
        right: `${safe.right * 100}%`,
        bottom: `${Math.max(safe.bottom, 0.2) * 100}%`,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "baseline",
        gap: `${gap}px`,
        opacity: anim.opacity,
        zIndex: ATOMIC_LAYER_DEPTH.kinetic_karaoke,
      }}
    >
      {tokens.map((token, i) => {
        const spokenAt = token.startSeconds - startSeconds;
        const wordSpring = spring({
          frame: Math.max(0, Math.round((anim.localSeconds - spokenAt) * anim.fps)),
          fps: anim.fps,
          config: snappy,
        });
        const active = anim.localSeconds >= spokenAt;
        const scale = active ? lerpClamp(wordSpring, [0, 1], [1, 1.15]) : 1;
        const wordColor = active && wordSpring > 0.2 ? accentColor : color;

        return (
          <span
            key={`${token.text}-${i}`}
            style={themeTypographyStyle(token.text, theme, {
              display: "inline-block",
              fontSize: "clamp(1.2rem, 4.5vw, 2.6rem)",
              fontWeight: theme.typography.weightScale.heading,
              color: wordColor,
              transform: `scale(${scale})`,
              transformOrigin: "center bottom",
              opacity: active
                ? lerpClamp(wordSpring, [0, 1], [0.35, 1])
                : 0.35,
              WebkitTextStroke: `0.06em ${withAlpha(theme.colors.background, 0.9)}`,
              paintOrder: "stroke fill",
              textShadow: active ? `0 0 18px ${accentColor}` : "none",
            })}
          >
            {token.text}
          </span>
        );
      })}
    </div>
  );
};
