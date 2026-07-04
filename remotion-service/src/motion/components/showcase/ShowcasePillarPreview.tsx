import React from "react";
import { AbsoluteFill } from "remotion";
import type { ThemeToken } from "@types/theme-tokens";
import { DEFAULT_THEME } from "@types/theme-tokens";
import { ThemeProvider } from "@components/theme/ThemeProvider";
import { DeviceMockup3D } from "./DeviceMockup3D";
import { DynamicFeatureCallout } from "./DynamicFeatureCallout";

export interface ShowcasePillarPreviewProps {
  theme?: ThemeToken;
}

export const ShowcasePillarPreview: React.FC<ShowcasePillarPreviewProps> = ({
  theme = DEFAULT_THEME,
}) => (
  <ThemeProvider theme={theme}>
    <AbsoluteFill style={{ backgroundColor: theme.colors.background }}>
      <DeviceMockup3D
        startSeconds={0}
        endSeconds={6}
        device="phone"
        title="Your App"
      />
      <DynamicFeatureCallout
        startSeconds={0.4}
        endSeconds={6}
        text="One-tap export"
        xPct={68}
        yPct={36}
      />
    </AbsoluteFill>
  </ThemeProvider>
);
