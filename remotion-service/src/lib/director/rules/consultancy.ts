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
  brollQuery?: string,
): TriggerCandidate {
  return {
    id: `${type}-${Math.round(start * 1000)}`,
    type,
    transcriptStart: start,
    transcriptEnd: end,
    confidence: clamp01(confidence),
    componentId,
    props,
    brollQuery,
  };
}

export function proposeConsultancyTriggers(signals: DirectorSignals): TriggerCandidate[] {
  const out: TriggerCandidate[] = [];

  for (const stat of signals.stats) {
    out.push(
      mk(
        "stat_mention",
        stat.start,
        stat.end,
        stat.confidence,
        "metric_ticker",
        {
          label: stat.label ?? "Metric",
          value: stat.value ?? stat.rawText,
        },
      ),
    );
  }

  const shifts = signals.topicShifts;
  if (shifts.length >= 3) {
    const start = shifts[0]!.start;
    const end = shifts[shifts.length - 1]!.end;
    out.push(
      mk(
        "topic_shift",
        start,
        end,
        0.85,
        shifts.length >= 4 ? "strategy_funnel" : "corporate_timeline",
        {
          title: "Strategy",
          steps: shifts.slice(0, 6).map((s) => s.topicLabel ?? "Phase"),
        },
      ),
    );
  } else {
    for (const seg of shifts) {
      out.push(
        mk(
          "topic_shift",
          seg.start,
          seg.end,
          seg.confidence,
          "timeline_flow",
          { steps: [seg.topicLabel ?? "Phase"] },
        ),
      );
    }
  }

  for (const cmp of signals.comparisons) {
    out.push(
      mk(
        "comparison_phrase",
        cmp.start,
        cmp.end,
        cmp.confidence,
        "comparison_chart",
        {
          title: "Comparison",
          labels: cmp.labels ?? ["A", "B"],
          values: cmp.values ?? [50, 50],
        },
      ),
    );
  }

  return out;
}
