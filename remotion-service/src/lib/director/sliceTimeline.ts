import type {
  AudioClipEntry,
  BRollEntry,
  CaptionCueEntry,
  CaptionWord,
  DirectorContentType,
  DirectorTimeline,
  MotionGraphicsEntry,
  SfxEntry,
  TriggerLogEntry,
  VideoClipEntry,
  VFXOverlayEntry,
} from "@types/timeline";
import type { MulticamEntry } from "@types/multicam";
import type { TransitionEntry } from "@types/transitions";

export interface SliceOptions {
  parentTimeline: DirectorTimeline;
  startFrame: number;
  endFrame: number;
  targetContentType: DirectorContentType;
}

interface FrameWindow {
  start: number;
  end: number;
}

function clipWindow(startFrame: number, endFrame: number): FrameWindow {
  return { start: startFrame, end: endFrame };
}

function overlapWindow(
  entryStart: number,
  entryEnd: number,
  window: FrameWindow,
): FrameWindow | null {
  const start = Math.max(entryStart, window.start);
  const end = Math.min(entryEnd, window.end);
  if (start >= end) return null;
  return { start, end };
}

function remapToClip(local: FrameWindow, window: FrameWindow): FrameWindow {
  return {
    start: local.start - window.start,
    end: local.end - window.start,
  };
}

function triggerMap(timeline: DirectorTimeline): Map<string, TriggerLogEntry> {
  return new Map(timeline.triggers.map((t) => [t.id, t]));
}

function triggerFullyInsideClip(
  trigger: TriggerLogEntry | undefined,
  clipStartSec: number,
  clipEndSec: number,
): boolean {
  if (!trigger) return false;
  return (
    trigger.transcriptStart >= clipStartSec &&
    trigger.transcriptEnd <= clipEndSec
  );
}

function hardContentSurvivesSlice(
  triggerId: string,
  triggers: Map<string, TriggerLogEntry>,
  clipStartSec: number,
  clipEndSec: number,
): boolean {
  return triggerFullyInsideClip(triggers.get(triggerId), clipStartSec, clipEndSec);
}

function trimContinuousEntry<T extends { startFrame: number; durationInFrames: number }>(
  entry: T,
  window: FrameWindow,
  adjust?: (trimmed: T, local: FrameWindow, removedStartFrames: number) => T,
): T | null {
  const entryEnd = entry.startFrame + entry.durationInFrames;
  const overlap = overlapWindow(entry.startFrame, entryEnd, window);
  if (!overlap) return null;

  const local = remapToClip(overlap, window);
  const removedStartFrames = overlap.start - entry.startFrame;
  const trimmed = {
    ...entry,
    startFrame: local.start,
    durationInFrames: local.end - local.start,
  };
  return adjust ? adjust(trimmed, local, removedStartFrames) : trimmed;
}

function sliceVideoClips(
  entries: VideoClipEntry[],
  window: FrameWindow,
): VideoClipEntry[] {
  const out: VideoClipEntry[] = [];
  for (const entry of entries) {
    const trimmed = trimContinuousEntry(entry, window, (t, _local, removed) => {
      const sourceSpan = entry.sourceEndSeconds - entry.sourceStartSeconds;
      const frameRatio =
        entry.durationInFrames > 0 ? sourceSpan / entry.durationInFrames : 0;
      const sourceOffset = removed * frameRatio;
      return {
        ...t,
        sourceStartSeconds: entry.sourceStartSeconds + sourceOffset,
        sourceEndSeconds:
          entry.sourceStartSeconds + sourceOffset + t.durationInFrames * frameRatio,
      };
    });
    if (trimmed) out.push(trimmed);
  }
  return out;
}

function sliceAudioClips(
  entries: AudioClipEntry[],
  window: FrameWindow,
): AudioClipEntry[] {
  const out: AudioClipEntry[] = [];
  for (const entry of entries) {
    const trimmed = trimContinuousEntry(entry, window, (t, _local, removed) => {
      const sourceSpan = entry.sourceEndSeconds - entry.sourceStartSeconds;
      const frameRatio =
        entry.durationInFrames > 0 ? sourceSpan / entry.durationInFrames : 0;
      const sourceOffset = removed * frameRatio;
      return {
        ...t,
        sourceStartSeconds: entry.sourceStartSeconds + sourceOffset,
        sourceEndSeconds:
          entry.sourceStartSeconds + sourceOffset + t.durationInFrames * frameRatio,
      };
    });
    if (trimmed) out.push(trimmed);
  }
  return out;
}

function sliceCaptions(
  entries: CaptionCueEntry[],
  window: FrameWindow,
): CaptionCueEntry[] {
  const out: CaptionCueEntry[] = [];
  for (const cue of entries) {
    const overlap = overlapWindow(cue.startFrame, cue.endFrame, window);
    if (!overlap) continue;

    const local = remapToClip(overlap, window);
    const words: CaptionWord[] = cue.words
      .filter((w) => w.endFrame > window.start && w.startFrame < window.end)
      .map((w) => {
        const wOverlap = overlapWindow(w.startFrame, w.endFrame, window);
        if (!wOverlap) return null;
        const wLocal = remapToClip(wOverlap, window);
        return {
          ...w,
          startFrame: wLocal.start,
          endFrame: wLocal.end,
        };
      })
      .filter((w): w is CaptionWord => w !== null);

    if (words.length === 0) continue;
    out.push({
      ...cue,
      startFrame: local.start,
      endFrame: local.end,
      words,
    });
  }
  return out;
}

function sliceMotionGraphics(
  entries: MotionGraphicsEntry[],
  triggers: Map<string, TriggerLogEntry>,
  clipStartSec: number,
  clipEndSec: number,
  window: FrameWindow,
): MotionGraphicsEntry[] {
  const out: MotionGraphicsEntry[] = [];
  for (const entry of entries) {
    if (!hardContentSurvivesSlice(entry.triggerId, triggers, clipStartSec, clipEndSec)) {
      continue;
    }
    const trimmed = trimContinuousEntry(entry, window);
    if (trimmed) out.push(trimmed);
  }
  return out;
}

function sliceBRoll(
  entries: BRollEntry[],
  triggers: Map<string, TriggerLogEntry>,
  clipStartSec: number,
  clipEndSec: number,
  window: FrameWindow,
): BRollEntry[] {
  const out: BRollEntry[] = [];
  for (const entry of entries) {
    if (!hardContentSurvivesSlice(entry.triggerId, triggers, clipStartSec, clipEndSec)) {
      continue;
    }
    const trimmed = trimContinuousEntry(entry, window);
    if (trimmed) out.push(trimmed);
  }
  return out;
}

function sliceTransitions(
  entries: TransitionEntry[],
  window: FrameWindow,
): TransitionEntry[] {
  return entries
    .map((entry) => {
      const overlap = overlapWindow(
        entry.atFrame,
        entry.atFrame + entry.durationInFrames,
        window,
      );
      if (!overlap) return null;
      const local = remapToClip(overlap, window);
      return {
        ...entry,
        atFrame: local.start,
        durationInFrames: local.end - local.start,
      };
    })
    .filter((e): e is TransitionEntry => e !== null);
}

function sliceSimpleContinuous<T extends { startFrame: number; durationInFrames: number }>(
  entries: T[],
  window: FrameWindow,
): T[] {
  const out: T[] = [];
  for (const entry of entries) {
    const trimmed = trimContinuousEntry(entry, window);
    if (trimmed) out.push(trimmed);
  }
  return out;
}

function sliceMulticam(
  entries: MulticamEntry[],
  window: FrameWindow,
): MulticamEntry[] {
  const out: MulticamEntry[] = [];
  for (const entry of entries) {
    const overlap = overlapWindow(entry.startFrame, entry.endFrame, window);
    if (!overlap) continue;
    const local = remapToClip(overlap, window);
    out.push({
      ...entry,
      startFrame: local.start,
      endFrame: local.end,
    });
  }
  return out;
}

function sliceTriggers(
  triggers: TriggerLogEntry[],
  clipStartSec: number,
  clipEndSec: number,
): TriggerLogEntry[] {
  return triggers
    .filter((t) => triggerFullyInsideClip(t, clipStartSec, clipEndSec))
    .map((t) => ({
      ...t,
      transcriptStart: t.transcriptStart - clipStartSec,
      transcriptEnd: t.transcriptEnd - clipStartSec,
    }));
}

/**
 * Slice a parent DirectorTimeline to a clip window — pure function per the
 * Timeline Slicing Determinism Law. Does not resolve new triggers.
 */
export function sliceTimeline(opts: SliceOptions): DirectorTimeline {
  const { parentTimeline, startFrame, endFrame, targetContentType } = opts;
  if (endFrame <= startFrame) {
    throw new Error("sliceTimeline endFrame must be greater than startFrame.");
  }

  const window = clipWindow(startFrame, endFrame);
  const fps = parentTimeline.fps;
  const clipStartSec = startFrame / fps;
  const clipEndSec = endFrame / fps;
  const triggers = triggerMap(parentTimeline);
  const durationInFrames = endFrame - startFrame;

  const slicedTriggers = sliceTriggers(parentTimeline.triggers, clipStartSec, clipEndSec);

  return {
    ...parentTimeline,
    contentType: parentTimeline.contentType,
    durationInFrames,
    tracks: {
      video: sliceVideoClips(parentTimeline.tracks.video, window),
      audio: sliceAudioClips(parentTimeline.tracks.audio, window),
      captions: sliceCaptions(parentTimeline.tracks.captions, window),
      broll: sliceBRoll(
        parentTimeline.tracks.broll,
        triggers,
        clipStartSec,
        clipEndSec,
        window,
      ),
      motionGraphics: sliceMotionGraphics(
        parentTimeline.tracks.motionGraphics,
        triggers,
        clipStartSec,
        clipEndSec,
        window,
      ),
      transitions: sliceTransitions(parentTimeline.tracks.transitions, window),
      vfx: sliceSimpleContinuous(parentTimeline.tracks.vfx, window) as VFXOverlayEntry[],
      sfx: sliceSimpleContinuous(parentTimeline.tracks.sfx, window) as SfxEntry[],
      multicam: sliceMulticam(parentTimeline.tracks.multicam, window),
    },
    triggers: slicedTriggers,
  };
}
