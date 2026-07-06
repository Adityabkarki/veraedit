import type {
  DirectorContentType,
  DirectorTimeline,
  VideoClipEntry,
} from "@types/timeline";
import type { TransitionEntry } from "@types/transitions";
import {
  buildSegmentsFromCuts,
  planFillerSpeedRamps,
} from "@lib/pacing/applyPacing";
import {
  collectCutPoints,
  cameraMotionForSegment,
  proposeTransitionsAtBoundaries,
} from "@lib/cuts/resolveCuts";
import type { DirectorSignals } from "@lib/director/signalTypes";
import {
  DEFAULT_PACING_BY_CONTENT,
  getPacingProfile,
  type PacingProfile,
} from "@lib/pacing/pacingProfile";

export interface ApplyCutsOptions {
  contentType: DirectorContentType;
  fps: number;
  durationSeconds: number;
  signals: DirectorSignals;
  pacing?: PacingProfile["profile"];
  sourceAssetId?: string;
  audioFrames?: { frame: number; isTransient: boolean }[];
}

function segmentKindForContent(
  contentType: DirectorContentType,
  index: number,
): "talking_head" | "static" | "screen" | "broll" {
  if (contentType === "showcase") {
    return index % 2 === 0 ? "screen" : "broll";
  }
  if (contentType === "consultancy") return "static";
  return "talking_head";
}

/** Apply cuts, camera motion, and transitions to a partial Director timeline. */
export function applyCutsToTimeline(
  timeline: DirectorTimeline,
  options: ApplyCutsOptions,
): DirectorTimeline {
  const {
    contentType,
    fps,
    durationSeconds,
    signals,
    pacing = DEFAULT_PACING_BY_CONTENT[contentType],
    sourceAssetId = "source-video",
    audioFrames,
  } = options;

  const profile = getPacingProfile(pacing);
  const cuts = collectCutPoints(signals, profile, contentType, audioFrames);
  const segments = buildSegmentsFromCuts(
    durationSeconds,
    cuts,
    fps,
    profile.minClipDurationFrames,
  );

  const video: VideoClipEntry[] = segments.map((seg, idx) => {
    const kind = segmentKindForContent(contentType, idx);
    const cameraMotion = cameraMotionForSegment(seg.id, contentType, kind, profile);
    const fillerRamps = planFillerSpeedRamps(signals.fillerSegments ?? [], profile, fps);
    const ramp = fillerRamps.find(
      (r) => r.startSeconds >= seg.sourceStartSeconds && r.endSeconds <= seg.sourceEndSeconds,
    );

    return {
      id: seg.id,
      assetId: sourceAssetId,
      startFrame: seg.timelineStartFrame,
      durationInFrames: seg.durationInFrames,
      sourceStartSeconds: seg.sourceStartSeconds,
      sourceEndSeconds: seg.sourceEndSeconds,
      speed: 1,
      playbackRate: ramp?.playbackRate ?? seg.playbackRate,
      cameraMotion,
      label: `Segment ${idx + 1}`,
    };
  });

  const segmentEndFrames = video.slice(0, -1).map((v) => v.startFrame + v.durationInFrames);
  const triggerFrames = cuts.map((c) => ({
    type: c.type,
    frame: Math.round(c.startSeconds * fps),
  }));

  const transitions: TransitionEntry[] = proposeTransitionsAtBoundaries(
    segmentEndFrames,
    triggerFrames,
    contentType,
    profile,
  );

  const cutTriggers = cuts.map((c) => ({
    id: c.triggerId ?? `cut-${Math.round(c.startSeconds * 1000)}`,
    type: c.type,
    transcriptStart: c.startSeconds,
    transcriptEnd: c.endSeconds,
    confidence: 0.85,
    status: "realized" as const,
    resultingEntryId: transitions.find((t) => t.triggerId?.startsWith(c.type))?.id,
  }));

  return {
    ...timeline,
    pacingProfile: pacing,
    tracks: {
      ...timeline.tracks,
      video,
      transitions,
    },
    triggers: [...timeline.triggers, ...cutTriggers],
  };
}
