import React, { useMemo } from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { MotionGraphicsProps } from "./types";
import { renderMotionElement } from "./elements";
import { toSequenceLocalElement } from "./motionMath";
import { FONT_DISPLAY } from "./fonts";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { migrateTheme } from "../lib/theme/migrateTheme";
import { AudioAnalysisProvider } from "./components/podcast/AudioAnalysisProvider";
import { useCompositionAudioAnalysis } from "./components/podcast/useCompositionAudioAnalysis";
import { ColorGrade } from "./components/vfx/ColorGrade";
import { NEUTRAL_GRADE } from "@lib/look/gradePresets";

/**
 * JSON-driven motion graphics dispatcher.
 * Fonts are loaded via ./fonts (google-fonts) before layout measurement.
 * Theme is resolved upstream — migrateTheme runs once at composition load.
 */
export const MotionGraphicsComposition: React.FC<MotionGraphicsProps> = ({
  plan,
  fontFamily,
  theme: rawTheme,
  transparentBackground = false,
}) => {
  const { fps } = useVideoConfig();
  const elements = plan?.elements ?? [];
  const family = fontFamily || FONT_DISPLAY;
  const theme = useMemo(
    () => migrateTheme(rawTheme ?? (plan as { theme?: unknown }).theme),
    [rawTheme, plan],
  );
  const audioTrack = useCompositionAudioAnalysis(plan);
  const applyGrade = plan.applyColorGrade === true;

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

  const content = (
    <AbsoluteFill
      style={{
        backgroundColor: transparentBackground ? "transparent" : theme.colors.background,
      }}
    >
      {elements.map((el) => {
        if (alwaysOn.has(el.type)) {
          return (
            <React.Fragment key={el.id}>{renderMotionElement(el, family)}</React.Fragment>
          );
        }
        const fromFrame = Math.max(0, Math.round(el.startSeconds * fps));
        const durationInFrames = Math.max(
          1,
          Math.round((el.endSeconds - el.startSeconds) * fps),
        );
        return (
          <Sequence
            key={el.id}
            from={fromFrame}
            durationInFrames={durationInFrames}
            layout="none"
          >
            {/* Sequence frames are local — re-base element bounds to 0. */}
            {renderMotionElement(toSequenceLocalElement(el), family)}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );

  return (
    <ThemeProvider theme={theme}>
      <AudioAnalysisProvider track={audioTrack}>
        {applyGrade ? (
          <ColorGrade grade={theme.grade ?? NEUTRAL_GRADE} seed={plan.directorSource ?? "mg"}>
            {content}
          </ColorGrade>
        ) : (
          content
        )}
      </AudioAnalysisProvider>
    </ThemeProvider>
  );
};
