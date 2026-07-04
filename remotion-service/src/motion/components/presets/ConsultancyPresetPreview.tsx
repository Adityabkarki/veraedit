import React from "react";
import { MotionGraphicsComposition } from "../../MotionGraphicsComposition";
import { FONT_DISPLAY } from "../../fonts";
import { DEFAULT_THEME } from "../../../types/theme-tokens";
import { buildPresetPlan } from "./buildPresetPlan";

export const ConsultancyPresetPreview: React.FC = () => {
  const plan = buildPresetPlan("consultancy", { durationSeconds: 6 });
  return (
    <MotionGraphicsComposition
      plan={plan}
      fontFamily={FONT_DISPLAY}
      theme={DEFAULT_THEME}
    />
  );
};
