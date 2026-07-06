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

export function proposeShowcaseTriggers(signals: DirectorSignals): TriggerCandidate[] {
  const out: TriggerCandidate[] = [];

  for (const seg of signals.sceneSegments) {
    if (seg.sceneType === "screen_recording") {
      out.push(
        mk(
          "screen_recording_segment",
          seg.start,
          seg.end,
          seg.confidence,
          "device_mockup",
          { title: seg.label ?? "Demo" },
        ),
      );
    } else if (seg.sceneType === "talking_head") {
      out.push(
        mk(
          "talking_head_segment",
          seg.start,
          seg.end,
          seg.confidence,
          "focus_frame",
          {},
        ),
      );
    }
  }

  for (const feat of signals.featureMentions) {
    out.push(
      mk(
        "feature_callout_phrase",
        feat.start,
        feat.end,
        feat.confidence,
        "dynamic_feature_callout",
        { label: feat.text ?? "Feature" },
      ),
    );
  }

  return out;
}
