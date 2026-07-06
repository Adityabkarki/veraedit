/**
 * Single props-resolution path for DirectorRender — used by preview and export.
 */
import type { DirectorTimeline } from "@types/timeline";
import type { CameraFeedRef } from "@types/multicam";
import { timelineToMotionPlan } from "./timelineToMotionPlan";

export const DIRECTOR_RENDER_COMPOSITION_ID = "DirectorRender";

export interface DirectorRenderInputProps {
  timeline: DirectorTimeline;
  assetUrls: Record<string, string>;
  primaryVideoSrc?: string;
  dialogueSrc?: string;
  cameraFeeds?: CameraFeedRef[];
  sfxUrls?: Record<string, string>;
  fontFamily?: string;
}

export interface ResolvedDirectorRender {
  compositionId: typeof DIRECTOR_RENDER_COMPOSITION_ID;
  inputProps: DirectorRenderInputProps;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  motionPlan: ReturnType<typeof timelineToMotionPlan>;
}

/** Resolve DirectorRender composition props from a DirectorTimeline. */
export function resolveDirectorRenderProps(
  timeline: DirectorTimeline,
  assets: {
    assetUrls?: Record<string, string>;
    primaryVideoSrc?: string;
    dialogueSrc?: string;
    cameraFeeds?: CameraFeedRef[];
    sfxUrls?: Record<string, string>;
    fontFamily?: string;
  } = {},
): ResolvedDirectorRender {
  const motionPlan = timelineToMotionPlan(timeline);
  return {
    compositionId: DIRECTOR_RENDER_COMPOSITION_ID,
    inputProps: {
      timeline,
      assetUrls: assets.assetUrls ?? {},
      primaryVideoSrc: assets.primaryVideoSrc,
      dialogueSrc: assets.dialogueSrc ?? assets.primaryVideoSrc,
      cameraFeeds: assets.cameraFeeds ?? [],
      sfxUrls: assets.sfxUrls ?? {},
      fontFamily: assets.fontFamily ?? "Montserrat",
    },
    durationInFrames: Math.max(1, timeline.durationInFrames),
    fps: timeline.fps,
    width: timeline.width,
    height: timeline.height,
    motionPlan,
  };
}
