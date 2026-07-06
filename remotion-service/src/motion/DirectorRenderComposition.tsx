/**
 * Full Director Engine export composition — video, motion graphics, VFX, grade, audio.
 * Legacy overlay-only exports continue to use MotionGraphicsComposition unchanged.
 */
import React, { useMemo } from "react";
import { AbsoluteFill } from "remotion";
import type { DirectorTimeline } from "@types/timeline";
import type { CameraFeedRef } from "@types/multicam";
import { timelineToMotionPlan } from "@lib/director/timelineToMotionPlan";
import { migrateTheme } from "@lib/theme/migrateTheme";
import { FONT_DISPLAY } from "./fonts";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { AudioAnalysisProvider } from "./components/podcast/AudioAnalysisProvider";
import { useCompositionAudioAnalysis } from "./components/podcast/useCompositionAudioAnalysis";
import { ColorGrade } from "./components/vfx/ColorGrade";
import { VfxOverlayLayer } from "./components/vfx/overlays/VfxOverlayLayer";
import { DirectorVideoLayer } from "./components/director/DirectorVideoLayer";
import { DirectorAudioMixer } from "./components/director/DirectorAudioMixer";
import { MotionGraphicsComposition } from "./MotionGraphicsComposition";

export interface DirectorRenderProps {
  timeline: DirectorTimeline;
  assetUrls: Record<string, string>;
  primaryVideoSrc?: string;
  dialogueSrc?: string;
  cameraFeeds?: CameraFeedRef[];
  sfxUrls?: Record<string, string>;
  fontFamily?: string;
}

export const DirectorRenderComposition: React.FC<DirectorRenderProps> = ({
  timeline,
  assetUrls,
  primaryVideoSrc,
  dialogueSrc,
  cameraFeeds,
  sfxUrls,
  fontFamily = FONT_DISPLAY,
}) => {
  const theme = useMemo(() => migrateTheme(timeline.theme), [timeline.theme]);
  const plan = useMemo(
    () => ({
      ...timelineToMotionPlan(timeline),
      applyColorGrade: false,
    }),
    [timeline],
  );
  const audioTrack = useCompositionAudioAnalysis(plan);

  return (
    <ThemeProvider theme={theme}>
      <AudioAnalysisProvider track={audioTrack}>
        <AbsoluteFill style={{ backgroundColor: theme.colors.background }}>
          <ColorGrade grade={theme.grade} seed={timeline.projectId}>
            <AbsoluteFill>
              <DirectorVideoLayer
                timeline={timeline}
                assetUrls={assetUrls}
                primaryVideoSrc={primaryVideoSrc}
                cameraFeeds={cameraFeeds}
              />
              <MotionGraphicsComposition
                plan={plan}
                fontFamily={fontFamily}
                theme={theme}
                transparentBackground
              />
              <VfxOverlayLayer entries={timeline.tracks.vfx} />
            </AbsoluteFill>
          </ColorGrade>
          <DirectorAudioMixer
            timeline={timeline}
            assetUrls={assetUrls}
            sfxUrls={sfxUrls}
            dialogueSrc={dialogueSrc ?? primaryVideoSrc}
          />
        </AbsoluteFill>
      </AudioAnalysisProvider>
    </ThemeProvider>
  );
};
