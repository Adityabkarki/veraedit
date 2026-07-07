import type {
  CaptionCueEntry,
  DirectorContentType,
  DirectorTimeline,
  PacingProfileName,
} from "@types/timeline";
import { applyCutsToTimeline } from "@lib/cuts/applyCutsToTimeline";
import { applyGradeToTheme } from "@lib/look/resolveLook";
import { DEFAULT_PACING_BY_CONTENT } from "@lib/pacing/pacingProfile";
import type { DirectorSignals } from "./signalTypes";

export interface ReskinOptions {
  timeline: DirectorTimeline;
  targetContentType: DirectorContentType;
  /** Required when target pillar differs from parent — drives cut/transition re-assignment. */
  signals: DirectorSignals;
  sourceAssetId?: string;
  audioFrames?: { frame: number; isTransient: boolean }[];
}

function karaokeCaptions(captions: CaptionCueEntry[]): CaptionCueEntry[] {
  return captions.map((cue) => ({
    ...cue,
    style: "karaoke" as const,
  }));
}

function rethemeMotionGraphics(
  timeline: DirectorTimeline,
  targetContentType: DirectorContentType,
): DirectorTimeline {
  return {
    ...timeline,
    tracks: {
      ...timeline.tracks,
      motionGraphics: timeline.tracks.motionGraphics.map((entry) => ({
        ...entry,
        props: {
          ...entry.props,
          pillar: targetContentType,
          grade: timeline.theme.grade,
        },
      })),
      broll: timeline.tracks.broll.map((entry) => ({
        ...entry,
        searchQuery: entry.searchQuery,
      })),
    },
  };
}

/**
 * Re-skin a sliced timeline to a target content pillar per the Re-Skin Consistency Law.
 * Fully replaces pacing, grade, caption style, and transitions — never a partial blend.
 */
export function reskinTimeline(opts: ReskinOptions): DirectorTimeline {
  const { timeline, targetContentType, signals, sourceAssetId, audioFrames } = opts;
  if (timeline.contentType === targetContentType) {
    return timeline;
  }

  const pacing: PacingProfileName = DEFAULT_PACING_BY_CONTENT[targetContentType];
  const durationSeconds = timeline.durationInFrames / timeline.fps;

  const retainedMotion = timeline.tracks.motionGraphics;
  const retainedBroll = timeline.tracks.broll;
  const retainedSfx = timeline.tracks.sfx;
  const retainedVfx = timeline.tracks.vfx;
  const retainedTriggers = timeline.triggers;

  const gradedTheme = applyGradeToTheme(timeline.theme, targetContentType);
  const assetId =
    sourceAssetId ?? timeline.tracks.video[0]?.assetId ?? "source-video";

  const cutBase: DirectorTimeline = {
    ...timeline,
    contentType: targetContentType,
    pacingProfile: pacing,
    theme: gradedTheme,
    tracks: {
      ...timeline.tracks,
      video: [],
      transitions: [],
      motionGraphics: [],
      broll: [],
      captions: [],
      vfx: [],
      sfx: [],
    },
    triggers: [],
  };

  let reskinned = applyCutsToTimeline(cutBase, {
    contentType: targetContentType,
    fps: timeline.fps,
    durationSeconds,
    signals,
    pacing,
    sourceAssetId: assetId,
    audioFrames,
  });

  if (targetContentType === "social") {
    reskinned = {
      ...reskinned,
      tracks: {
        ...reskinned.tracks,
        captions: karaokeCaptions(reskinned.tracks.captions),
      },
    };
  }

  reskinned = {
    ...reskinned,
    tracks: {
      ...reskinned.tracks,
      motionGraphics: retainedMotion,
      broll: retainedBroll,
      sfx: retainedSfx,
      vfx: retainedVfx,
    },
    triggers: retainedTriggers,
  };

  return rethemeMotionGraphics(reskinned, targetContentType);
}
