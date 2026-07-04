import React from "react";
import { AbsoluteFill } from "remotion";
import type { ThemeToken } from "@types/theme-tokens";
import { DEFAULT_THEME } from "@types/theme-tokens";
import { ThemeProvider } from "@components/theme/ThemeProvider";
import { StrategyFunnel } from "./StrategyFunnel";
import { GlassmorphicMetricTicker } from "./GlassmorphicMetricTicker";
import { CorporateTimelineRoadmap } from "./CorporateTimelineRoadmap";

export interface ConsultancyPillarPreviewProps {
  theme?: ThemeToken;
}

export const ConsultancyPillarPreview: React.FC<ConsultancyPillarPreviewProps> = ({
  theme = DEFAULT_THEME,
}) => (
  <ThemeProvider theme={theme}>
    <AbsoluteFill style={{ backgroundColor: theme.colors.background }}>
      <StrategyFunnel startSeconds={0} endSeconds={6} />
      <GlassmorphicMetricTicker
        startSeconds={0.3}
        endSeconds={6}
        title="Pipeline"
        value={2480}
        suffix="k"
        trend={1}
      />
      <CorporateTimelineRoadmap startSeconds={0.2} endSeconds={6} />
    </AbsoluteFill>
  </ThemeProvider>
);
