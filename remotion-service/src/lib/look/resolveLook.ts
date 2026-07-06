import type {
  DirectorContentType,
  DirectorTimeline,
  GraphicsDensity,
  TriggerLogEntry,
} from "@types/timeline";
import type { ThemeToken } from "@types/theme-tokens";
import type { VFXOverlayEntry } from "@types/vfx";
import { vfxLayerDepth } from "@types/vfx";
import { throttleTriggers } from "@lib/director/resolveTimeline";
import type { DirectorSignals } from "@lib/director/signalTypes";
import { gradeForContentType, mergeGrade, NEUTRAL_GRADE, type GradeToken } from "./gradePresets";
import {
  proposeConsultancyVfx,
  proposePodcastVfx,
  proposeShowcaseVfx,
  proposeSocialVfx,
  type VfxTriggerCandidate,
} from "./vfxRules";

const GLITCH_MAX_FRAMES = 4;

function secondsToFrames(seconds: number, fps: number): number {
  return Math.max(0, Math.round(seconds * fps));
}

function proposeVfx(
  contentType: DirectorContentType,
  signals: DirectorSignals,
): VfxTriggerCandidate[] {
  switch (contentType) {
    case "podcast":
      return proposePodcastVfx(signals);
    case "consultancy":
      return proposeConsultancyVfx(signals);
    case "social":
      return proposeSocialVfx(signals);
    case "showcase":
      return proposeShowcaseVfx(signals);
    default:
      return [];
  }
}

/** Apply content-type grade to theme (grade is always on, never throttled). */
export function applyGradeToTheme(
  theme: ThemeToken,
  contentType: DirectorContentType,
): ThemeToken {
  const preset = gradeForContentType(contentType);
  const overrides: Partial<GradeToken> = {};
  for (const key of Object.keys(NEUTRAL_GRADE) as (keyof GradeToken)[]) {
    if (theme.grade[key] !== NEUTRAL_GRADE[key]) {
      overrides[key] = theme.grade[key];
    }
  }
  return {
    ...theme,
    grade: mergeGrade(preset, Object.keys(overrides).length ? overrides : undefined),
  };
}

/** Resolve VFX overlay entries through the shared Density Throttle. */
export function resolveVfxOverlays(
  timeline: DirectorTimeline,
  signals: DirectorSignals,
  density: GraphicsDensity,
): { vfx: VFXOverlayEntry[]; triggers: TriggerLogEntry[] } {
  const proposed = proposeVfx(timeline.contentType, signals);
  const asCandidates = proposed.map((p) => ({
    id: p.id,
    type: p.type,
    transcriptStart: p.transcriptStart,
    transcriptEnd: p.transcriptEnd,
    confidence: p.confidence,
    componentId: p.componentId,
    metadata: { vfxType: p.vfxType, intensity: p.intensity },
  }));

  const { realized, suppressed } = throttleTriggers(asCandidates, density);
  const vfx: VFXOverlayEntry[] = [];
  const triggers: TriggerLogEntry[] = [];

  for (const c of suppressed) {
    triggers.push({
      id: c.id,
      type: c.type,
      transcriptStart: c.transcriptStart,
      transcriptEnd: c.transcriptEnd,
      confidence: c.confidence,
      status: "suppressed",
      metadata: c.metadata,
    });
  }

  for (const c of realized) {
    const original = proposed.find((p) => p.id === c.id)!;
    const startFrame = secondsToFrames(c.transcriptStart, timeline.fps);
    let durationInFrames = Math.max(
      1,
      secondsToFrames(c.transcriptEnd, timeline.fps) - startFrame,
    );
    if (original.vfxType === "glitch") {
      durationInFrames = Math.min(durationInFrames, GLITCH_MAX_FRAMES);
    }

    const entryId = `vfx-${c.id}`;
    vfx.push({
      id: entryId,
      type: original.vfxType,
      startFrame,
      durationInFrames,
      layerDepth: vfxLayerDepth(original.vfxType),
      intensity: original.intensity,
      triggerId: c.id,
    });

    triggers.push({
      id: c.id,
      type: c.type,
      transcriptStart: c.transcriptStart,
      transcriptEnd: c.transcriptEnd,
      confidence: c.confidence,
      status: "realized",
      resultingEntryId: entryId,
      metadata: c.metadata,
    });
  }

  return { vfx, triggers };
}

/** Full Look pass — grade + VFX overlays. */
export function applyLookToTimeline(
  timeline: DirectorTimeline,
  signals: DirectorSignals,
  density: GraphicsDensity = "balanced",
): DirectorTimeline {
  const theme = applyGradeToTheme(timeline.theme, timeline.contentType);
  const { vfx, triggers } = resolveVfxOverlays(timeline, signals, density);

  return {
    ...timeline,
    theme,
    tracks: {
      ...timeline.tracks,
      vfx,
    },
    triggers: [...timeline.triggers, ...triggers],
  };
}
