import type { TriggerCandidate } from "@types/timeline";
import type { DirectorSignals } from "./signalTypes";

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

export function proposePodcastTriggers(signals: DirectorSignals): TriggerCandidate[] {
  const out: TriggerCandidate[] = [];

  if (signals.durationSeconds > 0) {
    out.push(
      mk("episode_start", 0, Math.min(4, signals.durationSeconds), 0.95, "broadcast_lower_third", {
        title: "Episode",
        subtitle: "Podcast",
      }),
    );
  }

  for (const seg of signals.speakerChanges) {
    out.push(
      mk(
        "speaker_change",
        seg.start,
        seg.end,
        seg.confidence,
        "active_speaker_split",
        { activeSpeakerId: seg.speakerId },
        {
          speakerId: seg.speakerId,
          confidenceSource: seg.confidenceSource ?? "heuristic",
        },
      ),
    );
  }

  for (const seg of signals.sustainedSpeech) {
    out.push(
      mk("sustained_speech", seg.start, seg.end, seg.confidence, "symmetric_audio_strip"),
    );
  }

  for (const seg of signals.emphasisMoments) {
    out.push(
      mk(
        "high_emphasis_moment",
        seg.start,
        seg.end,
        seg.confidence,
        "quote_callout",
        { text: seg.text ?? "" },
        { text: seg.text },
      ),
    );
  }

  for (const seg of signals.topicShifts) {
    out.push(
      mk(
        "topic_shift",
        seg.start,
        seg.end,
        seg.confidence * 0.7,
        "chapter_marker",
        { label: seg.topicLabel ?? "Topic" },
        { topicLabel: seg.topicLabel },
      ),
    );
    out[out.length - 1]!.brollQuery = seg.topicLabel;
  }

  return out;
}
