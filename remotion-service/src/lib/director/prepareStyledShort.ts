import type {
  DirectorContentType,
  DirectorTimeline,
  VideoClipEntry,
} from "@types/timeline";
import type { ThemeToken } from "@types/theme-tokens";
import { detectAspectMode } from "../../motion/components/safeZones";
import { runDirector } from "./resolveTimeline";
import { reskinTimeline } from "./reskinTimeline";
import { sliceTimeline } from "./sliceTimeline";
import type { DirectorSignals, TimeRangeSignal } from "./signalTypes";
import {
  applyPlatformVariantToTimeline,
  type PlatformRenderVariant,
} from "./platformRenderVariant";

export interface HookPhraseInput {
  text: string;
  confidence: number;
  start: number;
  end: number;
  /** Viral scoring / retention model output — Honest Confidence Law. */
  confidenceSource?: "heuristic" | "ml";
}

export interface PrepareStyledShortOptions {
  parentTimeline?: DirectorTimeline | null;
  startFrame: number;
  endFrame: number;
  targetContentType: DirectorContentType;
  projectId: string;
  fps: number;
  width: number;
  height: number;
  theme: ThemeToken;
  signals?: DirectorSignals;
  hookPhrase?: HookPhraseInput;
  sourceAssetId?: string;
  reframedSourceAssetId?: string;
  audioFrames?: { frame: number; isTransient: boolean }[];
  platformVariant?: PlatformRenderVariant;
  reframeWarning?: string | null;
  panX?: number;
}

function shiftSignal<T extends TimeRangeSignal>(signal: T, offset: number): T {
  return {
    ...signal,
    start: signal.start - offset,
    end: signal.end - offset,
  };
}

/** Filter and re-base signals to a clip window (seconds). */
export function filterSignalsToWindow(
  signals: DirectorSignals,
  windowStartSec: number,
  windowEndSec: number,
  fps: number = 30,
): DirectorSignals {
  const inWindow = (s: TimeRangeSignal) =>
    s.start >= windowStartSec && s.end <= windowEndSec;

  const clipDuration = windowEndSec - windowStartSec;
  const startFrame = Math.round(windowStartSec * fps);
  const endFrame = Math.round(windowEndSec * fps);

  return {
    durationSeconds: clipDuration,
    speakerChanges: signals.speakerChanges
      .filter(inWindow)
      .map((s) => shiftSignal(s, windowStartSec)),
    topicShifts: signals.topicShifts
      .filter(inWindow)
      .map((s) => shiftSignal(s, windowStartSec)),
    stats: signals.stats.filter(inWindow).map((s) => shiftSignal(s, windowStartSec)),
    comparisons: signals.comparisons
      .filter(inWindow)
      .map((s) => shiftSignal(s, windowStartSec)),
    emphasisMoments: signals.emphasisMoments
      .filter(inWindow)
      .map((s) => shiftSignal(s, windowStartSec)),
    silences: signals.silences
      .filter(inWindow)
      .map((s) => shiftSignal(s, windowStartSec)),
    sustainedSpeech: signals.sustainedSpeech
      .filter(inWindow)
      .map((s) => shiftSignal(s, windowStartSec)),
    words: signals.words
      .filter((w) => w.start >= windowStartSec && w.end <= windowEndSec)
      .map((w, index) => ({
        ...w,
        index,
        start: w.start - windowStartSec,
        end: w.end - windowStartSec,
      })),
    ctaPhrases: signals.ctaPhrases
      .filter(inWindow)
      .map((s) => shiftSignal(s, windowStartSec)),
    featureMentions: signals.featureMentions
      .filter(inWindow)
      .map((s) => shiftSignal(s, windowStartSec)),
    sceneSegments: signals.sceneSegments
      .filter(inWindow)
      .map((s) => shiftSignal(s, windowStartSec)),
    shotClassifications: signals.shotClassifications,
    audioFrames: signals.audioFrames?.filter(
      (f) => f.frame >= startFrame && f.frame <= endFrame,
    ),
    fillerSegments: signals.fillerSegments
      ?.filter((f) => f.start >= windowStartSec && f.end <= windowEndSec)
      .map((f) => ({
        ...f,
        start: f.start - windowStartSec,
        end: f.end - windowStartSec,
      })),
  };
}

function injectMlHook(
  scoped: DirectorSignals,
  hook: HookPhraseInput,
  clipStartSec: number,
): DirectorSignals {
  const hookStart = Math.max(0, hook.start - clipStartSec);
  const hookEnd = Math.min(scoped.durationSeconds, hook.end - clipStartSec);
  const mlMoment = {
    start: hookStart,
    end: hookEnd,
    confidence: hook.confidence,
    text: hook.text,
    confidenceSource: (hook.confidenceSource ?? "ml") as "ml",
  };

  const filtered = scoped.emphasisMoments.filter(
    (e) => e.start > 3.5 || e.end > scoped.durationSeconds,
  );

  return {
    ...scoped,
    emphasisMoments: [mlMoment, ...filtered],
  };
}

function compileClipTimeline(opts: PrepareStyledShortOptions): DirectorTimeline {
  if (!opts.signals) {
    throw new Error(
      "No parent DirectorTimeline and no signals provided for clip compile fallback.",
    );
  }

  const clipStartSec = opts.startFrame / opts.fps;
  const clipEndSec = opts.endFrame / opts.fps;
  let scoped = filterSignalsToWindow(
    opts.signals,
    clipStartSec,
    clipEndSec,
    opts.fps,
  );

  if (opts.hookPhrase) {
    scoped = injectMlHook(scoped, opts.hookPhrase, clipStartSec);
  }

  const sourceId = opts.reframedSourceAssetId ?? opts.sourceAssetId;

  return runDirector({
    projectId: opts.projectId,
    contentType: opts.targetContentType,
    fps: opts.fps,
    durationSeconds: scoped.durationSeconds,
    width: opts.width,
    height: opts.height,
    theme: opts.theme,
    signals: scoped,
    density: "immersive",
    sourceAssetId: sourceId,
    audioFrames: opts.audioFrames,
  });
}

/** Point video clips at a pre-reframed 9:16 source starting at frame 0. */
export function normalizeTimelineForReframedSource(
  timeline: DirectorTimeline,
  reframedAssetId: string,
): DirectorTimeline {
  const durationSec = timeline.durationInFrames / timeline.fps;
  const video: VideoClipEntry[] = [
    {
      id: "reframed-main",
      assetId: reframedAssetId,
      startFrame: 0,
      durationInFrames: timeline.durationInFrames,
      sourceStartSeconds: 0,
      sourceEndSeconds: durationSec,
      speed: 1,
      label: "vertical_reframed",
    },
  ];
  return {
    ...timeline,
    tracks: {
      ...timeline.tracks,
      video,
    },
  };
}

/** Ensure 9:16 + social safe-zone metadata for motion compositing. */
export function enforceVerticalSafeZones(
  timeline: DirectorTimeline,
  opts?: { reframeWarning?: string | null; panX?: number },
): DirectorTimeline {
  const width = timeline.height > timeline.width ? timeline.width : 1080;
  const height = timeline.height > timeline.width ? timeline.height : 1920;
  const mode = detectAspectMode(width, height);

  return {
    ...timeline,
    width,
    height,
    renderMetadata: {
      safeZoneMode: mode === "social_9_16" ? "social_9_16" : "broadcast_16_9",
      reframeWarning: opts?.reframeWarning ?? timeline.renderMetadata?.reframeWarning,
      panX: opts?.panX ?? timeline.renderMetadata?.panX ?? 0.5,
      verticalReframed: mode === "social_9_16",
    },
  };
}

/**
 * Compile base timeline (slice/reskin/fallback) WITHOUT platform variant —
 * Platform Variant Law: one compile, many render-time variants.
 */
export function prepareStyledShortBase(
  opts: Omit<PrepareStyledShortOptions, "platformVariant">,
): DirectorTimeline {
  const clipStartSec = opts.startFrame / opts.fps;
  const clipEndSec = opts.endFrame / opts.fps;

  if (!opts.signals && !opts.parentTimeline) {
    throw new Error(
      "prepareStyledShortBase requires either parentTimeline or signals.",
    );
  }

  let timeline: DirectorTimeline;

  if (opts.parentTimeline) {
    timeline = sliceTimeline({
      parentTimeline: opts.parentTimeline,
      startFrame: opts.startFrame,
      endFrame: opts.endFrame,
      targetContentType: opts.targetContentType,
    });
  } else {
    timeline = compileClipTimeline(opts as PrepareStyledShortOptions);
  }

  const scopedSignals = opts.signals
    ? filterSignalsToWindow(opts.signals, clipStartSec, clipEndSec, opts.fps)
    : undefined;

  if (opts.hookPhrase && scopedSignals) {
    const withHook = injectMlHook(scopedSignals, opts.hookPhrase, clipStartSec);
    if (timeline.contentType !== opts.targetContentType) {
      timeline = reskinTimeline({
        timeline,
        targetContentType: opts.targetContentType,
        signals: withHook,
        sourceAssetId: opts.reframedSourceAssetId ?? opts.sourceAssetId,
        audioFrames: opts.audioFrames,
      });
    }
  } else if (timeline.contentType !== opts.targetContentType) {
    if (!scopedSignals) {
      throw new Error(
        "Re-skinning requires scoped signals when parent pillar differs from target.",
      );
    }
    timeline = reskinTimeline({
      timeline,
      targetContentType: opts.targetContentType,
      signals: scopedSignals,
      sourceAssetId: opts.reframedSourceAssetId ?? opts.sourceAssetId,
      audioFrames: opts.audioFrames,
    });
  }

  timeline = {
    ...timeline,
    width: opts.width,
    height: opts.height,
    durationInFrames: opts.endFrame - opts.startFrame,
  };

  if (opts.reframedSourceAssetId) {
    timeline = normalizeTimelineForReframedSource(
      timeline,
      opts.reframedSourceAssetId,
    );
  }

  return enforceVerticalSafeZones(timeline, {
    reframeWarning: opts.reframeWarning,
    panX: opts.panX,
  });
}

/** Full prepare including optional platform variant (single-platform render). */
export function prepareStyledShort(opts: PrepareStyledShortOptions): DirectorTimeline {
  const { platformVariant, ...baseOpts } = opts;
  let timeline = prepareStyledShortBase(baseOpts);
  if (platformVariant) {
    timeline = applyPlatformVariantToTimeline(timeline, platformVariant);
  }
  return timeline;
}
