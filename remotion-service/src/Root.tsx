import React from "react";
import { Composition } from "remotion";
import { CaptionComposition } from "./CaptionComposition";
import { TitleCardComposition } from "./TitleCardComposition";
import { LowerThirdComposition } from "./LowerThirdComposition";
import { MotionGraphicsComposition } from "./motion/MotionGraphicsComposition";
import { DirectorRenderComposition } from "./motion/DirectorRenderComposition";
import type { MotionPlan } from "./motion/types";
import type { DirectorTimeline } from "./types/timeline";
import { FONT_DISPLAY, FONT_DEVANAGARI } from "./motion/fonts";
import { PodcastPillarPreview, AudioEqualizerDebugStill, PodcastAudioComparisonPreview } from "./motion/components/podcast";
import { ConsultancyPillarPreview } from "./motion/components/consultancy";
import { SocialPillarPreview } from "./motion/components/social";
import { ShowcasePillarPreview } from "./motion/components/showcase";
import {
  PodcastPresetPreview,
  ConsultancyPresetPreview,
  SocialPresetPreview,
  ProductShowcasePresetPreview,
} from "./motion/components/presets";
import { TEST_LIGHT_THEME } from "./lib/theme/resolveTheme";

const montserratFamily = FONT_DISPLAY;
const notoFamily = FONT_DEVANAGARI;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="CaptionOverlay"
      component={CaptionComposition}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        words: [],
        style: "hormozi" as const,
        fontFamily: montserratFamily,
      }}
    />
    <Composition
      id="TitleCardOverlay"
      component={TitleCardComposition}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        text: "",
        startSeconds: 0,
        endSeconds: 3,
        fontFamily: montserratFamily,
        brandColor: "#3b82f6",
      }}
    />
    <Composition
      id="LowerThirdOverlay"
      component={LowerThirdComposition}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        text: "",
        subtext: "",
        startSeconds: 0,
        endSeconds: 4,
        fontFamily: montserratFamily,
        brandColor: "#3b82f6",
        animation: "slide_up" as const,
      }}
    />
    <Composition
      id="MotionGraphicsOverlay"
      component={MotionGraphicsComposition}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        plan: { version: 1, fps: 30, width: 1080, height: 1920, elements: [] } as MotionPlan,
        fontFamily: montserratFamily,
      }}
    />
    <Composition
      id="DirectorRender"
      component={DirectorRenderComposition}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        timeline: {
          schemaVersion: 1,
          projectId: "preview",
          contentType: "podcast",
          fps: 30,
          durationInFrames: 300,
          width: 1920,
          height: 1080,
          theme: TEST_LIGHT_THEME,
          tracks: {
            video: [],
            audio: [],
            captions: [],
            broll: [],
            motionGraphics: [],
            transitions: [],
            vfx: [],
            sfx: [],
            multicam: [],
          },
          triggers: [],
        } as DirectorTimeline,
        assetUrls: {},
      }}
    />
    {/* Atomic pillar previews — duration in seconds (6s @ 30fps = 180 frames) */}
    <Composition
      id="PodcastPillarPreview"
      component={PodcastPillarPreview}
      durationInFrames={180}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="PodcastPillarPreviewLight"
      component={PodcastPillarPreview}
      durationInFrames={180}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ theme: TEST_LIGHT_THEME }}
    />
    <Composition
      id="ConsultancyPillarPreview"
      component={ConsultancyPillarPreview}
      durationInFrames={180}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="ConsultancyPillarPreviewLight"
      component={ConsultancyPillarPreview}
      durationInFrames={180}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ theme: TEST_LIGHT_THEME }}
    />
    <Composition
      id="SocialPillarPreview"
      component={SocialPillarPreview}
      durationInFrames={180}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="SocialPillarPreviewLight"
      component={SocialPillarPreview}
      durationInFrames={180}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ theme: TEST_LIGHT_THEME }}
    />
    <Composition
      id="ShowcasePillarPreview"
      component={ShowcasePillarPreview}
      durationInFrames={180}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="ShowcasePillarPreviewLight"
      component={ShowcasePillarPreview}
      durationInFrames={180}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ theme: TEST_LIGHT_THEME }}
    />
    {/* Step 4 — one-tap atomic presets (full stacks) */}
    <Composition
      id="PodcastPresetPreview"
      component={PodcastPresetPreview}
      durationInFrames={180}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="ConsultancyPresetPreview"
      component={ConsultancyPresetPreview}
      durationInFrames={180}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="SocialPresetPreview"
      component={SocialPresetPreview}
      durationInFrames={180}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="ProductShowcasePresetPreview"
      component={ProductShowcasePresetPreview}
      durationInFrames={180}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="AudioEqualizerDebugStill"
      component={AudioEqualizerDebugStill}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="PodcastAudioComparisonPreview"
      component={PodcastAudioComparisonPreview}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);

export const FONT_FAMILIES = {
  montserrat: montserratFamily,
  notoDevanagari: notoFamily,
};
