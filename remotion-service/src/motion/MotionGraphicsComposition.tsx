import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { MotionGraphicsProps } from "./types";
import { renderMotionElement } from "./elements";
import { FONT_DISPLAY } from "./fonts";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { migrateTheme } from "../lib/theme/migrateTheme";

/**
 * JSON-driven motion graphics dispatcher.
 * Fonts are loaded via ./fonts (google-fonts) before layout measurement.
 * Theme is resolved upstream — migrateTheme runs once at composition load.
 */
export const MotionGraphicsComposition: React.FC<MotionGraphicsProps> = ({
  plan,
  fontFamily,
  theme: rawTheme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;
  const elements = plan?.elements ?? [];
  const family = fontFamily || FONT_DISPLAY;
  const theme = useMemo(
    () => migrateTheme(rawTheme ?? (plan as { theme?: unknown }).theme),
    [rawTheme, plan],
  );

  const alwaysOn = new Set([
    "background_gradient",
    "background_shader",
    "texture_bg",
    "geometric_pattern",
    "halftone",
    "focus_frame",
    "social_frame",
    "glitch_overlay",
    "hud_grid",
    "split_screen",
    "grid_layout",
    "eq_visualizer",
    "symmetric_audio_strip",
    "voice_waveform",
    "active_speaker_split",
    "vertical_clip_template",
  ]);

  return (
    <ThemeProvider theme={theme}>
      <AbsoluteFill style={{ backgroundColor: theme.colors.background }}>
        {elements.map((el) => {
          if (
            currentTime < el.startSeconds ||
            currentTime > el.endSeconds
          ) {
            if (!alwaysOn.has(el.type)) return null;
          }
          return renderMotionElement(el, family);
        })}
      </AbsoluteFill>
    </ThemeProvider>
  );
};
