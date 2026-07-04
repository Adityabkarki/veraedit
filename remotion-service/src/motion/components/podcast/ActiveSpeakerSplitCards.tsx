/**
 * Active Speaker Split-Cards — flex-grid tracking activeSpeakerId.
 * Active card scales to 1.05 via elegant_glide + soft glow border; silent dims.
 * Graceful degradation: no activeSpeakerId → neutral non-highlighted state.
 */

import React from "react";
import { spring } from "remotion";
import { ATOMIC_LAYER_DEPTH } from "../layerDepth";
import { lerpClamp } from "../interpolateClamp";
import { useAtomicAnimation } from "../useAtomicAnimation";
import { curveConfig } from "../physics";
import { withAlpha } from "@lib/theme/colorMath";
import { useTheme } from "@components/theme/ThemeProvider";
import { themeTypographyStyle } from "@components/theme/themeTypography";
import {
  detectAspectMode,
  titleSafeRect,
} from "../safeZones";

export interface SpeakerCard {
  id: string;
  name: string;
  role?: string;
  monogram?: string;
  /** Per-speaker accent override (content data, not theme default). */
  brandColor?: string;
}

export interface ActiveSpeakerSplitCardsProps {
  startSeconds?: number;
  endSeconds?: number;
  speakers?: SpeakerCard[];
  /** When omitted, all cards render neutral (Graceful Degradation Law). */
  activeSpeakerId?: string | null;
}

export const ActiveSpeakerSplitCards: React.FC<ActiveSpeakerSplitCardsProps> = ({
  startSeconds = 0,
  endSeconds = 8,
  speakers,
  activeSpeakerId = null,
}) => {
  const theme = useTheme();
  const defaultSpeakers: SpeakerCard[] = [
    { id: "host", name: "Host", role: "Host", monogram: "H", brandColor: theme.colors.primary },
    { id: "guest", name: "Guest", role: "Guest", monogram: "G", brandColor: theme.colors.accent },
  ];

  const anim = useAtomicAnimation({
    startSeconds,
    endSeconds,
    enterCurve: theme.motion.defaultCurve,
    exitCurve: theme.motion.defaultCurve,
    enterDurationSeconds: 0.45,
    exitDurationSeconds: 0.35,
  });
  if (!anim.active) return null;

  const cards = speakers && speakers.length >= 2 ? speakers.slice(0, 4) : defaultSpeakers;
  const mode = detectAspectMode(anim.width, anim.height);
  const safe = titleSafeRect(mode);
  const glide = curveConfig(theme.motion.defaultCurve);
  const hasActive = Boolean(activeSpeakerId);

  return (
    <div
      style={{
        position: "absolute",
        left: `${safe.left * 100}%`,
        right: `${safe.right * 100}%`,
        top: `${Math.max(safe.top, 0.12) * 100}%`,
        bottom: `${Math.max(safe.bottom, 0.22) * 100}%`,
        display: "flex",
        flexDirection: "row",
        gap: "2%",
        alignItems: "stretch",
        justifyContent: "center",
        opacity: anim.opacity,
        zIndex: ATOMIC_LAYER_DEPTH.active_speaker_split,
      }}
    >
      {cards.map((speaker, i) => {
        const isActive = hasActive && speaker.id === activeSpeakerId;
        const isSilent = hasActive && !isActive;
        const stagger = i * 0.08;
        const cardEnter = spring({
          frame: Math.max(0, Math.round((anim.localSeconds - stagger) * anim.fps)),
          fps: anim.fps,
          config: glide,
        });
        const activeScale = isActive
          ? spring({
              frame: Math.max(0, Math.round(anim.localSeconds * anim.fps)),
              fps: anim.fps,
              config: glide,
            })
          : 0;
        const scale = isActive
          ? lerpClamp(activeScale, [0, 1], [1, 1.05])
          : lerpClamp(cardEnter, [0, 1], [0.96, 1]);
        const brand = speaker.brandColor ?? theme.colors.primary;
        const dim = isSilent ? 0.45 : 1;

        return (
          <div
            key={speaker.id}
            style={{
              flex: "1 1 0",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              padding: "3%",
              borderRadius: "4%",
              background: withAlpha(theme.colors.surface, theme.glass.surfaceOpacity + 0.35),
              border: isActive
                ? `2px solid ${brand}`
                : `1px solid ${withAlpha(theme.colors.onSurface, theme.glass.borderOpacity)}`,
              boxShadow: isActive
                ? `0 0 28px ${withAlpha(brand, 0.55)}, inset 0 0 0 1px ${withAlpha(brand, 0.35)}`
                : `inset 0 1px 0 ${withAlpha(theme.colors.onSurface, 0.08)}`,
              transform: `scale(${scale})`,
              opacity: dim * Math.min(cardEnter, 1),
              transition: "none",
            }}
          >
            <div
              style={{
                width: "42%",
                aspectRatio: "1",
                borderRadius: "50%",
                background: `linear-gradient(145deg, ${brand}, ${theme.colors.background})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: theme.colors.onPrimary,
                fontWeight: theme.typography.weightScale.heading,
                fontSize: "2.2em",
                marginBottom: "8%",
                boxShadow: isActive ? `0 0 20px ${withAlpha(brand, 0.6)}` : undefined,
              }}
            >
              {(speaker.monogram ?? speaker.name).slice(0, 2)}
            </div>
            <div
              style={themeTypographyStyle(speaker.name, theme, {
                color: theme.colors.onSurface,
                fontWeight: theme.typography.weightScale.heading,
                fontSize: "1.1em",
                textAlign: "center",
              })}
            >
              {speaker.name}
            </div>
            {speaker.role && (
              <div
                style={themeTypographyStyle(speaker.role, theme, {
                  color: withAlpha(theme.colors.onSurface, 0.7),
                  fontWeight: 600,
                  fontSize: "0.85em",
                  textAlign: "center",
                })}
              >
                {speaker.role}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
