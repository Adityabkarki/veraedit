/**
 * Basic preview composition for Pillar 1 — Podcast Toolkit.
 * Duration in seconds; frame count derived from useVideoConfig fps.
 */

import React from "react";
import { AbsoluteFill } from "remotion";
import type { ThemeToken } from "@types/theme-tokens";
import { DEFAULT_THEME } from "@types/theme-tokens";
import { ThemeProvider } from "@components/theme/ThemeProvider";
import { SymmetricAudioStrip } from "./SymmetricAudioStrip";
import { CircularOrbitEqualizer } from "./CircularOrbitEqualizer";
import { ActiveSpeakerSplitCards } from "./ActiveSpeakerSplitCards";

export interface PodcastPillarPreviewProps {
  theme?: ThemeToken;
}

export const PodcastPillarPreview: React.FC<PodcastPillarPreviewProps> = ({
  theme = DEFAULT_THEME,
}) => {
  return (
    <ThemeProvider theme={theme}>
      <AbsoluteFill style={{ backgroundColor: theme.colors.background }}>
        <ActiveSpeakerSplitCards
          startSeconds={0}
          endSeconds={6}
          activeSpeakerId="host"
        />
        <CircularOrbitEqualizer
          startSeconds={0.2}
          endSeconds={6}
          monogram="H"
          xPct={50}
          yPct={38}
          sizePct={22}
        />
        <SymmetricAudioStrip startSeconds={0.1} endSeconds={6} />
      </AbsoluteFill>
    </ThemeProvider>
  );
};
