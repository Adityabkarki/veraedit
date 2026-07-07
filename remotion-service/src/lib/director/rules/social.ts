import type { TriggerCandidate } from "@types/timeline";
import type { DirectorSignals } from "../signalTypes";
import { groupWordsIntoPhrases } from "../captionCues";

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
  metadata?: Record<string, unknown>,
): TriggerCandidate {
  return {
    id: `${type}-${Math.round(start * 1000)}`,
    type,
    transcriptStart: start,
    transcriptEnd: end,
    confidence: clamp01(confidence),
    componentId,
    props,
    metadata,
  };
}

export function proposeSocialTriggers(signals: DirectorSignals): TriggerCandidate[] {
  const out: TriggerCandidate[] = [];

  // Captions are content, not decoration — one karaoke phrase per caption cue.
  // kinetic_caption candidates bypass the Density Throttle in resolveTimeline.
  for (const phrase of groupWordsIntoPhrases(signals.words)) {
    out.push(
      mk(
        "kinetic_caption",
        phrase.start,
        phrase.end,
        0.9,
        "kinetic_karaoke",
        {
          text: phrase.text,
          // Word times are relative to the phrase start: the karaoke element is
          // re-based to Sequence-local time at render (toSequenceLocalElement).
          words: phrase.words.map((w) => ({
            text: w.text,
            startSeconds: Math.max(0, w.start - phrase.start),
          })),
        },
      ),
    );
  }

  const hookWindow = signals.emphasisMoments.filter((e) => e.start <= 3);
  for (const hook of hookWindow) {
    const confidenceSource =
      hook.confidenceSource === "ml" || hook.confidenceSource === "heuristic"
        ? hook.confidenceSource
        : undefined;
    out.push(
      mk(
        "hook_phrase",
        hook.start,
        Math.min(hook.end, 3.5),
        hook.confidence,
        "kinetic_text",
        { text: hook.text ?? "Hook" },
        confidenceSource ? { confidenceSource } : undefined,
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
