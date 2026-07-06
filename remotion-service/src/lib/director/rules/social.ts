import type { TriggerCandidate } from "@types/timeline";
import type { DirectorSignals } from "../signalTypes";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function mk(
  type: string,
  start: number,
  end: number,
  confidence: number,
  componentId: string,
  props?: Record<string, unknown>,
): TriggerCandidate {
  return {
    id: `${type}-${Math.round(start * 1000)}`,
    type,
    transcriptStart: start,
    transcriptEnd: end,
    confidence: clamp01(confidence),
    componentId,
    props,
  };
}

export function proposeSocialTriggers(signals: DirectorSignals): TriggerCandidate[] {
  const out: TriggerCandidate[] = [];

  for (const w of signals.words) {
    out.push(
      mk(
        "kinetic_caption",
        w.start,
        w.end,
        0.9,
        "kinetic_karaoke",
        { text: w.text, wordIndex: w.index },
      ),
    );
  }

  const hookWindow = signals.emphasisMoments.filter((e) => e.start <= 3);
  for (const hook of hookWindow) {
    out.push(
      mk(
        "hook_phrase",
        hook.start,
        Math.min(hook.end, 3.5),
        hook.confidence,
        "kinetic_text",
        { text: hook.text ?? "Hook" },
      ),
    );
  }

  for (const seg of signals.topicShifts) {
    out.push(
      mk(
        "topic_shift",
        seg.start,
        seg.end,
        seg.confidence,
        "animated_title",
        { text: seg.topicLabel ?? "Next" },
      ),
    );
  }

  for (const cta of signals.ctaPhrases) {
    out.push(
      mk(
        "cta_phrase",
        cta.start,
        cta.end,
        cta.confidence,
        "subscribe_badge",
        { text: cta.text ?? "Subscribe" },
      ),
    );
  }

  return out;
}
