import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { MotionGraphicsProps } from "./types";
import { renderMotionElement } from "./elements";
import { FONT_DISPLAY } from "./fonts";

/**
 * JSON-driven motion graphics dispatcher.
 * Fonts are loaded via ./fonts (google-fonts) before layout measurement.
 */
export const MotionGraphicsComposition: React.FC<MotionGraphicsProps> = ({
  plan,
  fontFamily,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;
  const elements = plan?.elements ?? [];
  const family = fontFamily || FONT_DISPLAY;

  // Full-frame structural types always evaluate (they self-gate on timing)
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
    "voice_waveform",
  ]);

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
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
  );
};
