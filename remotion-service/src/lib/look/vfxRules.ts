import type { TriggerCandidate } from "@types/timeline";
import type { VFXOverlayType } from "@types/vfx";
import type { DirectorSignals } from "@lib/director/signalTypes";

export interface VfxTriggerCandidate extends TriggerCandidate {
  vfxType: VFXOverlayType;
  intensity: number;
}

function mkVfx(
  type: string,
  vfxType: VFXOverlayType,
  start: number,
  end: number,
  confidence: number,
  intensity: number,
): VfxTriggerCandidate {
  return {
    id: `${type}-${Math.round(start * 1000)}`,
    type,
    transcriptStart: start,
    transcriptEnd: end,
    confidence: Math.max(0, Math.min(1, confidence)),
    componentId: `vfx_${vfxType}`,
    vfxType,
    intensity,
  };
}

/** Podcast — no auto VFX (manual only). */
export function proposePodcastVfx(_signals: DirectorSignals): VfxTriggerCandidate[] {
  return [];
}

/** Consultancy — VFX explicitly disabled by default. */
export function proposeConsultancyVfx(_signals: DirectorSignals): VfxTriggerCandidate[] {
  return [];
}

/** Social — glitch/chromatic on hooks and beats. */
export function proposeSocialVfx(signals: DirectorSignals): VfxTriggerCandidate[] {
  const out: VfxTriggerCandidate[] = [];

  for (const hook of signals.emphasisMoments.filter((e) => e.start <= 3)) {
    out.push(mkVfx("hook_phrase", "glitch", hook.start, hook.end, hook.confidence, 0.7));
  }

  for (const fr of signals.audioFrames ?? []) {
    if (!fr.isTransient) continue;
    const t = fr.frame / 30;
    out.push(mkVfx("beat", "chromatic_aberration", t, t + 0.15, 0.82, 0.5));
  }

  return out;
}

/** Showcase — light leaks only, sparingly at emphasis moments. */
export function proposeShowcaseVfx(signals: DirectorSignals): VfxTriggerCandidate[] {
  const out: VfxTriggerCandidate[] = [];
  for (const seg of signals.emphasisMoments.slice(0, 2)) {
    out.push(mkVfx("emphasis", "light_leak", seg.start, seg.end, 0.7, 0.45));
  }
  return out;
}
