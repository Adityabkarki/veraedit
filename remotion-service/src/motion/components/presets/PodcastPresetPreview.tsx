/**
 * One-tap Podcast preset preview — full atomic stack via MotionGraphicsComposition.
 */

import React from "react";
import { MotionGraphicsComposition } from "../../MotionGraphicsComposition";
import { FONT_DISPLAY } from "../../fonts";
import { DEFAULT_THEME } from "../../../types/theme-tokens";
import { buildPresetPlan } from "./buildPresetPlan";

const PRESET_DURATION_SECONDS = 6;

export const PodcastPresetPreview: React.FC = () => {
  const plan = buildPresetPlan("podcast", {
    durationSeconds: PRESET_DURATION_SECONDS,
  });
  return (
    <MotionGraphicsComposition
      plan={plan}
      fontFamily={FONT_DISPLAY}
      theme={DEFAULT_THEME}
    />
  );
};
