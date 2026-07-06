import type { DirectorContentType } from "@types/timeline";
import type { TransitionEntry, TransitionType } from "@types/transitions";
import type { CameraMotionSchema } from "@types/camera-motion";
import {
  buildDriftMotion,
  buildKenBurnsMotion,
  buildPushInMotion,
  buildWhipZoomMotion,
} from "@types/camera-motion";
import type { PacingProfile } from "@lib/pacing/pacingProfile";
import type { DirectorSignals } from "@lib/director/signalTypes";
import type { CutPoint } from "@lib/pacing/applyPacing";
import { silenceCutPoints } from "@lib/pacing/applyPacing";

export interface TransitionCandidate {
  atFrame: number;
  type: TransitionType;
  triggerId?: string;
  direction?: TransitionEntry["direction"];
}

const PODCAST_TRANSITIONS: Partial<Record<string, TransitionType>> = {
  speaker_change: "hard_cut",
  topic_shift: "crossfade",
};

const CONSULTANCY_TRANSITIONS: Partial<Record<string, TransitionType>> = {
  topic_shift: "slide",
  stat_mention: "crossfade",
};

const SOCIAL_TRANSITIONS: Partial<Record<string, TransitionType>> = {
  topic_shift: "whip_pan",
  hook_phrase: "zoom_blur_cut",
  beat: "glitch_cut",
};

const SHOWCASE_TRANSITIONS: Partial<Record<string, TransitionType>> = {
  screen_recording_segment: "whip_pan",
  feature_callout_phrase: "zoom_blur_cut",
};

export function defaultTransitionForTrigger(
  contentType: DirectorContentType,
  triggerType: string,
): TransitionType {
  const map =
    contentType === "podcast"
      ? PODCAST_TRANSITIONS
      : contentType === "consultancy"
        ? CONSULTANCY_TRANSITIONS
        : contentType === "social"
          ? SOCIAL_TRANSITIONS
          : SHOWCASE_TRANSITIONS;
  return map[triggerType] ?? "hard_cut";
}

/** Detect beat cut points from audio analysis isTransient frames. */
export function beatCutPoints(
  audioFrames: { frame: number; isTransient: boolean }[] | undefined,
  fps: number,
): CutPoint[] {
  if (!audioFrames?.length) return [];
  const cuts: CutPoint[] = [];
  let lastBeat = -999;
  const minGapFrames = Math.round(fps * 0.35);

  for (const fr of audioFrames) {
    if (!fr.isTransient) continue;
    if (fr.frame - lastBeat < minGapFrames) continue;
    lastBeat = fr.frame;
    const t = fr.frame / fps;
    cuts.push({
      startSeconds: t,
      endSeconds: t + 0.05,
      type: "beat",
      triggerId: `beat-${fr.frame}`,
    });
  }
  return cuts;
}

export function collectCutPoints(
  signals: DirectorSignals,
  profile: PacingProfile,
  contentType: DirectorContentType,
  audioFrames?: { frame: number; isTransient: boolean }[],
): CutPoint[] {
  const cuts: CutPoint[] = silenceCutPoints(signals.silences, profile);

  for (const sc of signals.speakerChanges) {
    cuts.push({
      startSeconds: sc.end,
      endSeconds: sc.end + 0.01,
      type: "speaker_change",
      triggerId: `speaker-${Math.round(sc.start * 1000)}`,
    });
  }

  if (contentType === "social") {
    cuts.push(...beatCutPoints(audioFrames, 30));
  }

  return cuts;
}

export function cameraMotionForSegment(
  clipId: string,
  contentType: DirectorContentType,
  segmentKind: "talking_head" | "static" | "screen" | "broll",
  profile: PacingProfile,
): CameraMotionSchema | undefined {
  const cap = profile.maxCameraMotionIntensity;
  switch (contentType) {
    case "podcast":
      if (segmentKind === "talking_head") return buildPushInMotion(clipId, cap);
      return undefined;
    case "consultancy":
      if (segmentKind === "static") return buildDriftMotion(clipId, cap);
      return undefined;
    case "social":
      return undefined;
    case "showcase":
      if (segmentKind === "broll" || segmentKind === "static") return buildKenBurnsMotion(clipId, cap);
      if (segmentKind === "screen") return buildWhipZoomMotion(clipId, cap);
      return undefined;
    default:
      return undefined;
  }
}

export function proposeTransitionsAtBoundaries(
  segmentEndFrames: number[],
  triggers: { type: string; frame: number }[],
  contentType: DirectorContentType,
  profile: PacingProfile,
): TransitionEntry[] {
  const entries: TransitionEntry[] = [];
  const boundarySet = new Set(segmentEndFrames);

  for (const tr of triggers) {
    if (!boundarySet.has(tr.frame)) continue;
    const type = defaultTransitionForTrigger(contentType, tr.type);
    if (type === "hard_cut") continue;

    entries.push({
      id: `trans-${tr.frame}-${tr.type}`,
      type,
      atFrame: tr.frame,
      durationInFrames: profile.defaultTransitionDurationFrames,
      easing: contentType === "consultancy" ? "linear" : "spring",
      direction: type === "whip_pan" || type === "slide" ? "left" : undefined,
      triggerId: `${tr.type}-${tr.frame}`,
    });
  }

  return entries;
}
