import type {
  DirectorContentType,
  DirectorTimeline,
  DirectorTimelineInput,
  GraphicsDensity,
  TriggerCandidate,
  TriggerLogEntry,
} from "@types/timeline";
import type { ThemeToken } from "@types/theme-tokens";
import { applyCutsToTimeline } from "@lib/cuts/applyCutsToTimeline";
import { applyLookToTimeline } from "@lib/look/resolveLook";
import { applyAudioMulticamToTimeline } from "@lib/audio/applyAudioMulticam";
import { DENSITY_LIMITS, DENSITY_WINDOW_SECONDS } from "./constants";
import { layerConflict, layerDepthForComponent } from "./layerRegistry";
import { proposeConsultancyTriggers } from "./rules/consultancy";
import { proposePodcastTriggers } from "./rules/podcast";
import { proposeShowcaseTriggers } from "./rules/showcase";
import { proposeSocialTriggers } from "./rules/social";
import type { DirectorSignals } from "./signalTypes";

export interface ResolveTimelineOptions extends DirectorTimelineInput {
  signals: DirectorSignals;
  density?: GraphicsDensity;
  theme: ThemeToken;
  audioFrames?: { frame: number; isTransient: boolean }[];
  cameraFeeds?: import("@types/multicam").CameraFeedRef[];
  musicBedAssetId?: string;
}

function secondsToFrames(seconds: number, fps: number): number {
  return Math.max(0, Math.round(seconds * fps));
}

function proposeTriggers(
  contentType: DirectorContentType,
  signals: DirectorSignals,
): TriggerCandidate[] {
  switch (contentType) {
    case "podcast":
      return proposePodcastTriggers(signals);
    case "consultancy":
      return proposeConsultancyTriggers(signals);
    case "social":
      return proposeSocialTriggers(signals);
    case "showcase":
      return proposeShowcaseTriggers(signals);
    default:
      return [];
  }
}

function windowIndex(startSeconds: number): number {
  return Math.floor(startSeconds / DENSITY_WINDOW_SECONDS);
}

function effectiveConfidence(candidate: TriggerCandidate): number {
  const source = candidate.metadata?.confidenceSource;
  if (source === "ml") return candidate.confidence;
  if (source === "heuristic") return candidate.confidence * 0.85;
  return candidate.confidence;
}

/** Rank and throttle triggers per the Density Throttle Law. */
export function throttleTriggers(
  candidates: TriggerCandidate[],
  density: GraphicsDensity,
): { realized: TriggerCandidate[]; suppressed: TriggerCandidate[] } {
  const limit = DENSITY_LIMITS[density];
  const byWindow = new Map<number, TriggerCandidate[]>();

  for (const c of candidates) {
    const idx = windowIndex(c.transcriptStart);
    const list = byWindow.get(idx) ?? [];
    list.push(c);
    byWindow.set(idx, list);
  }

  const realized: TriggerCandidate[] = [];
  const suppressed: TriggerCandidate[] = [];

  for (const list of byWindow.values()) {
    const sorted = [...list].sort(
      (a, b) => effectiveConfidence(b) - effectiveConfidence(a),
    );
    realized.push(...sorted.slice(0, limit));
    suppressed.push(...sorted.slice(limit));
  }

  return { realized, suppressed };
}

function resolveLayerConflicts(
  candidates: TriggerCandidate[],
  fps: number,
): { kept: TriggerCandidate[]; dropped: TriggerCandidate[] } {
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const kept: TriggerCandidate[] = [];
  const dropped: TriggerCandidate[] = [];

  for (const c of sorted) {
    const start = secondsToFrames(c.transcriptStart, fps);
    const end = secondsToFrames(c.transcriptEnd, fps);
    const depth = layerDepthForComponent(c.componentId);
    const conflict = kept.some((k) => {
      const kStart = secondsToFrames(k.transcriptStart, fps);
      const kEnd = secondsToFrames(k.transcriptEnd, fps);
      const kDepth = layerDepthForComponent(k.componentId);
      return layerConflict(start, end, depth, kStart, kEnd, kDepth);
    });
    if (conflict) dropped.push(c);
    else kept.push(c);
  }

  return { kept, dropped };
}

export function resolveTimeline(options: ResolveTimelineOptions): DirectorTimeline {
  const {
    projectId,
    contentType,
    fps,
    durationSeconds,
    width,
    height,
    theme,
    audioAnalysisRef,
    signals,
    density = "balanced",
    pacing,
    sourceAssetId,
    audioFrames,
    cameraFeeds,
    musicBedAssetId,
  } = options;

  const durationInFrames = secondsToFrames(durationSeconds, fps);
  const proposed = proposeTriggers(contentType, signals);
  const { realized: throttled, suppressed: densitySuppressed } = throttleTriggers(
    proposed,
    density,
  );
  const { kept, dropped: layerDropped } = resolveLayerConflicts(throttled, fps);

  const triggers: TriggerLogEntry[] = [];
  const motionGraphics: DirectorTimeline["tracks"]["motionGraphics"] = [];
  const broll: DirectorTimeline["tracks"]["broll"] = [];

  for (const c of [...densitySuppressed, ...layerDropped]) {
    triggers.push({
      id: c.id,
      type: c.type,
      transcriptStart: c.transcriptStart,
      transcriptEnd: c.transcriptEnd,
      confidence: c.confidence,
      status: "suppressed",
      metadata: c.metadata,
      confidenceSource:
        c.metadata?.confidenceSource === "ml" || c.metadata?.confidenceSource === "heuristic"
          ? c.metadata.confidenceSource
          : undefined,
    });
  }

  for (const c of kept) {
    const entryId = `entry-${c.id}`;
    const startFrame = secondsToFrames(c.transcriptStart, fps);
    const endFrame = Math.max(startFrame + 1, secondsToFrames(c.transcriptEnd, fps));
    const durationInFramesEntry = Math.min(endFrame - startFrame, durationInFrames - startFrame);
    const confidenceSource =
      c.metadata?.confidenceSource === "ml" || c.metadata?.confidenceSource === "heuristic"
        ? c.metadata.confidenceSource
        : undefined;

    if (c.brollQuery && contentType === "podcast") {
      broll.push({
        id: entryId,
        startFrame,
        durationInFrames: durationInFramesEntry,
        source: "pexels",
        assetUrl: "",
        searchQuery: c.brollQuery,
        triggerId: c.id,
      });
    } else {
      motionGraphics.push({
        id: entryId,
        componentId: c.componentId,
        startFrame,
        durationInFrames: durationInFramesEntry,
        layerDepth: layerDepthForComponent(c.componentId),
        props: c.props ?? {},
        triggerId: c.id,
      });
    }

    triggers.push({
      id: c.id,
      type: c.type,
      transcriptStart: c.transcriptStart,
      transcriptEnd: c.transcriptEnd,
      confidence: c.confidence,
      status: "realized",
      resultingEntryId: entryId,
      metadata: c.metadata,
      confidenceSource,
    });
  }

  const baseTimeline: DirectorTimeline = {
    schemaVersion: 1,
    projectId,
    contentType,
    fps,
    durationInFrames,
    width,
    height,
    theme,
    audioAnalysisRef,
    tracks: {
      video: [],
      audio: [],
      captions: [],
      broll,
      motionGraphics,
      transitions: [],
      vfx: [],
      sfx: [],
      multicam: [],
    },
    triggers,
  };

  const withCuts = applyCutsToTimeline(baseTimeline, {
    contentType,
    fps,
    durationSeconds,
    signals,
    pacing,
    sourceAssetId,
    audioFrames,
  });

  const withLook = applyLookToTimeline(withCuts, signals, density);

  return applyAudioMulticamToTimeline(withLook, {
    signals,
    density,
    cameraFeeds,
    musicBedAssetId,
  });
}

export function runDirector(options: ResolveTimelineOptions): DirectorTimeline {
  return resolveTimeline(options);
}
