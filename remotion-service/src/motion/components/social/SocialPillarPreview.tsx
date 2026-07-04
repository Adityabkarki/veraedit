import React from "react";
import { AbsoluteFill } from "remotion";
import type { ThemeToken } from "@types/theme-tokens";
import { DEFAULT_THEME } from "@types/theme-tokens";
import { ThemeProvider } from "@components/theme/ThemeProvider";
import { VerticalClipTemplate } from "./VerticalClipTemplate";
import { ScribbleAnnotation } from "./ScribbleAnnotation";

export interface SocialPillarPreviewProps {
  theme?: ThemeToken;
}

export const SocialPillarPreview: React.FC<SocialPillarPreviewProps> = ({
  theme = DEFAULT_THEME,
}) => (
  <ThemeProvider theme={theme}>
    <AbsoluteFill style={{ backgroundColor: theme.colors.background }}>
      <VerticalClipTemplate
        startSeconds={0}
        endSeconds={6}
        platform="tiktok"
        caption="यो भिडियो हेर्नुहोस्"
      />
      <ScribbleAnnotation
        startSeconds={0.4}
        endSeconds={6}
        variant="circle"
        label="Look"
        xPct={68}
        yPct={36}
      />
    </AbsoluteFill>
  </ThemeProvider>
);
