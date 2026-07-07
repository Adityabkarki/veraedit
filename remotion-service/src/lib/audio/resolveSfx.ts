import type { DirectorContentType, SfxEntry, TransitionEntry } from "@types/timeline";
import type { TriggerLogEntry } from "@types/timeline";
import { throttleTriggers } from "@lib/director/resolveTimeline";
import type { GraphicsDensity } from "@types/timeline";
import { soundIdForTransition, soundIdForTrigger } from "./sfxLibrary";

export interface SfxProposal {
  id: string;
  soundId: string;
  startFrame: number;
  triggerId: string;
  volume: number;
  confidence: number;
  transcriptStart: number;
  transcriptEnd: number;
}

function secondsToFrames(seconds: number, fps: number): number {
  return Math.max(0, Math.round(seconds * fps));
}

// kinetic_caption is deliberately absent: captions bypass the Density Throttle
// (they are content), so a pop per caption phrase would fire every ~2 seconds.
// Emphasis moments carry the pop instead — a traceable, meaningful cue.
const CONTENT_SFX_ENABLED: Record<DirectorContentType, Set<string>> = {
  podcast: new Set(["high_emphasis_moment"]),
  consultancy: new Set(["stat_mention"]),
  social: new Set([
    "hook_phrase",
    "high_emphasis_moment",
    "beat",
    "topic_shift",
  ]),
  showcase: new Set(["feature_callout_phrase", "screen_recording_segment"]),
};

export function proposeSfxFromTriggers(
  triggers: TriggerLogEntry[],
  transitions: TransitionEntry[],
  contentType: DirectorContentType,
  fps: number,
): SfxProposal[] {
  const allowed = CONTENT_SFX_ENABLED[contentType];
  const out: SfxProposal[] = [];

  for (const tr of triggers) {
    if (tr.status !== "realized" || !allowed.has(tr.type)) continue;
    const soundId = soundIdForTrigger(tr.type, tr.id);
    if (!soundId) continue;
    out.push({
      id: `sfx-${tr.id}`,
      soundId,
      startFrame: secondsToFrames(tr.transcriptStart, fps),
      triggerId: tr.id,
      volume: contentType === "social" ? 0.55 : 0.4,
      confidence: tr.confidence,
      transcriptStart: tr.transcriptStart,
      transcriptEnd: tr.transcriptEnd,
    });
  }

  if (contentType === "social" || contentType === "showcase") {
    for (const trans of transitions) {
      const soundId = soundIdForTransition(trans.type, trans.id);
      if (!soundId || !trans.triggerId) continue;
      out.push({
        id: `sfx-trans-${trans.id}`,
        soundId,
        startFrame: trans.atFrame,
        triggerId: trans.triggerId,
        volume: 0.45,
        confidence: 0.85,
        transcriptStart: trans.atFrame / fps,
        transcriptEnd: (trans.atFrame + trans.durationInFrames) / fps,
      });
    }
  }

  return out;
}

export function resolveSfxEntries(
  proposals: SfxProposal[],
  density: GraphicsDensity,
): { sfx: SfxEntry[]; suppressed: SfxProposal[] } {
  const candidates = proposals.map((p) => ({
    id: p.id,
    type: "sfx",
    transcriptStart: p.transcriptStart,
    transcriptEnd: p.transcriptEnd,
    confidence: p.confidence,
    componentId: p.soundId,
    metadata: { soundId: p.soundId, volume: p.volume, triggerId: p.triggerId },
  }));

  const { realized, suppressed } = throttleTriggers(candidates, density);
  const suppressedProposals = proposals.filter((p) =>
    suppressed.some((s) => s.id === p.id),
  );

  const sfx: SfxEntry[] = realized.map((r) => {
    const orig = proposals.find((p) => p.id === r.id)!;
    return {
      id: orig.id,
      soundId: orig.soundId,
      startFrame: orig.startFrame,
      triggerId: orig.triggerId,
      volume: orig.volume,
    };
  });

  return { sfx, suppressed: suppressedProposals };
}
