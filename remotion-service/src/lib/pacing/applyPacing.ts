import type { PacingProfile } from "./pacingProfile";

export interface CutPoint {
  startSeconds: number;
  endSeconds: number;
  type: "silence" | "filler" | "speaker_change" | "topic_shift" | "beat";
  triggerId?: string;
}

export interface SpeedRampSegment {
  startSeconds: number;
  endSeconds: number;
  playbackRate: number;
  easeInFrames: number;
  easeOutFrames: number;
}

export interface VideoSegmentPlan {
  id: string;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  timelineStartFrame: number;
  durationInFrames: number;
  playbackRate: number;
}

/**
 * Convert silence gaps into cut points subject to pacing profile thresholds.
 */
export function silenceCutPoints(
  silences: { start: number; end: number }[],
  profile: PacingProfile,
): CutPoint[] {
  const thresholdSec = profile.silenceTrimThresholdMs / 1000;
  return silences
    .filter((s) => s.end - s.start >= thresholdSec)
    .map((s) => ({
      startSeconds: s.start,
      endSeconds: s.end,
      type: "silence" as const,
      triggerId: `silence-${Math.round(s.start * 1000)}`,
    }));
}

/** Build non-overlapping kept segments after removing cut regions. */
export function buildSegmentsFromCuts(
  durationSeconds: number,
  cuts: CutPoint[],
  fps: number,
  minClipDurationFrames: number,
): VideoSegmentPlan[] {
  const minDurSec = minClipDurationFrames / fps;
  const sorted = [...cuts].sort((a, b) => a.startSeconds - b.startSeconds);
  const removeRanges = sorted.map((c) => [c.startSeconds, c.endSeconds] as const);

  const segments: VideoSegmentPlan[] = [];
  let cursor = 0;
  let timelineFrame = 0;
  let idx = 0;

  for (const [cutStart, cutEnd] of removeRanges) {
    if (cutStart > cursor) {
      const dur = cutStart - cursor;
      if (dur >= minDurSec) {
        const frames = Math.round(dur * fps);
        segments.push({
          id: `seg-${idx++}`,
          sourceStartSeconds: cursor,
          sourceEndSeconds: cutStart,
          timelineStartFrame: timelineFrame,
          durationInFrames: frames,
          playbackRate: 1,
        });
        timelineFrame += frames;
      }
    }
    cursor = Math.max(cursor, cutEnd);
  }

  if (cursor < durationSeconds) {
    const dur = durationSeconds - cursor;
    if (dur >= minDurSec || segments.length === 0) {
      const frames = Math.max(minClipDurationFrames, Math.round(dur * fps));
      segments.push({
        id: `seg-${idx}`,
        sourceStartSeconds: cursor,
        sourceEndSeconds: durationSeconds,
        timelineStartFrame: timelineFrame,
        durationInFrames: frames,
        playbackRate: 1,
      });
    }
  }

  return segments;
}

/**
 * Speed-ramp filler segments with eased rate changes (aggressive profile).
 * Uses elastic-style ease on the rate envelope — never an instant jump.
 */
export function planFillerSpeedRamps(
  fillers: { start: number; end: number }[],
  profile: PacingProfile,
  fps: number,
): SpeedRampSegment[] {
  if (!profile.speedRampOnFiller) return [];
  const easeFrames = Math.max(3, Math.round(fps * 0.12));
  return fillers.map((f) => ({
    startSeconds: f.start,
    endSeconds: f.end,
    playbackRate: 1.6,
    easeInFrames: easeFrames,
    easeOutFrames: easeFrames,
  }));
}

/** Playback rate at local frame within a speed-ramp segment. */
export function speedRampAtFrame(
  localFrame: number,
  durationInFrames: number,
  targetRate: number,
  easeInFrames: number,
  easeOutFrames: number,
): number {
  if (durationInFrames <= 0) return 1;
  let rate = targetRate;
  if (localFrame < easeInFrames) {
    const t = localFrame / easeInFrames;
    rate = 1 + (targetRate - 1) * (t * t * (3 - 2 * t));
  } else if (localFrame > durationInFrames - easeOutFrames) {
    const rem = durationInFrames - localFrame;
    const t = rem / easeOutFrames;
    rate = 1 + (targetRate - 1) * (t * t * (3 - 2 * t));
  }
  return rate;
}

/** Count cut points — used to verify presets produce different rhythms. */
export function countCutPoints(cuts: CutPoint[]): number {
  return cuts.length;
}
