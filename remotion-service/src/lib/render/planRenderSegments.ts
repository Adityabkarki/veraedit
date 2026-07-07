/**
 * Long-form render segment planning (Phase 14).
 *
 * Below threshold: single segment — short exports unchanged.
 * Above threshold: split at transition-respecting boundaries near target duration.
 */
import type { DirectorTimeline } from "@types/timeline";
import type { TransitionEntry } from "@types/transitions";
import type { VideoClipEntry } from "@types/timeline";

export const RENDER_SEGMENT_THRESHOLD_MINUTES = 10;
export const DEFAULT_TARGET_SEGMENT_MINUTES = 4;

export interface RenderSegment {
  segmentIndex: number;
  startFrame: number;
  endFrame: number;
}

export interface PlanRenderSegmentsOptions {
  targetSegmentMinutes?: number;
  thresholdMinutes?: number;
}

function transitionRange(t: TransitionEntry): { start: number; end: number } {
  const at = Number(t.atFrame ?? 0);
  const dur = Number(t.durationInFrames ?? 0);
  return { start: at, end: at + Math.max(dur, 1) };
}

function clipRange(c: VideoClipEntry): { start: number; end: number } {
  const start = Number(c.startFrame ?? 0);
  const dur = Number(c.durationInFrames ?? 0);
  return { start, end: start + Math.max(dur, 1) };
}

function isInsideRange(frame: number, start: number, end: number): boolean {
  return frame > start && frame < end;
}

function isForbiddenSplitFrame(
  frame: number,
  transitions: TransitionEntry[],
  clips: VideoClipEntry[],
): boolean {
  for (const t of transitions) {
    const { start, end } = transitionRange(t);
    if (isInsideRange(frame, start, end)) return true;
  }
  for (const c of clips) {
    const { start, end } = clipRange(c);
    if (isInsideRange(frame, start, end)) return true;
  }
  return false;
}

function collectSafeSplitCandidates(
  durationInFrames: number,
  clips: VideoClipEntry[],
  transitions: TransitionEntry[],
): number[] {
  const candidates = new Set<number>([0, durationInFrames]);
  const sorted = [...clips].sort((a, b) => a.startFrame - b.startFrame);
  for (const clip of sorted) {
    const { start, end } = clipRange(clip);
    candidates.add(start);
    candidates.add(end);
  }
  for (const t of transitions) {
    const { start, end } = transitionRange(t);
    candidates.add(start);
    candidates.add(end);
  }
  return [...candidates]
    .filter((f) => f >= 0 && f <= durationInFrames)
    .filter((f) => !isForbiddenSplitFrame(f, transitions, clips))
    .sort((a, b) => a - b);
}

function snapSplitFrame(target: number, candidates: number[], minFrame: number): number {
  let best = candidates[candidates.length - 1] ?? target;
  let bestDist = Infinity;
  for (const c of candidates) {
    if (c <= minFrame) continue;
    const dist = Math.abs(c - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

export function planRenderSegments(
  timeline: DirectorTimeline,
  targetSegmentMinutes = DEFAULT_TARGET_SEGMENT_MINUTES,
  options?: PlanRenderSegmentsOptions,
): RenderSegment[] {
  const fps = Number(timeline.fps) || 30;
  const durationInFrames = Math.max(
    1,
    Number(timeline.durationInFrames) ||
      Math.ceil((Number((timeline as { durationSeconds?: number }).durationSeconds) || 0) * fps),
  );
  const thresholdMinutes =
    options?.thresholdMinutes ?? RENDER_SEGMENT_THRESHOLD_MINUTES;
  const thresholdFrames = thresholdMinutes * 60 * fps;

  if (durationInFrames <= thresholdFrames) {
    return [{ segmentIndex: 0, startFrame: 0, endFrame: durationInFrames - 1 }];
  }

  const targetMinutes = options?.targetSegmentMinutes ?? targetSegmentMinutes;
  const targetFrames = targetMinutes * 60 * fps;
  const clips = timeline.tracks?.video ?? [];
  const transitions = timeline.tracks?.transitions ?? [];
  const candidates = collectSafeSplitCandidates(durationInFrames, clips, transitions);

  const splitPoints: number[] = [0];
  let cursor = 0;
  while (cursor < durationInFrames - 1) {
    const target = cursor + targetFrames;
    if (target >= durationInFrames - 1) break;
    const split = snapSplitFrame(target, candidates, cursor + Math.floor(fps * 30));
    if (split <= cursor) break;
    splitPoints.push(split);
    cursor = split;
  }
  if (splitPoints[splitPoints.length - 1] !== durationInFrames) {
    splitPoints.push(durationInFrames);
  }

  const segments: RenderSegment[] = [];
  for (let i = 0; i < splitPoints.length - 1; i += 1) {
    const start = splitPoints[i];
    const end = splitPoints[i + 1] - 1;
    if (end >= start) {
      segments.push({ segmentIndex: i, startFrame: start, endFrame: end });
    }
  }
  return segments.length > 0
    ? segments
    : [{ segmentIndex: 0, startFrame: 0, endFrame: durationInFrames - 1 }];
}
