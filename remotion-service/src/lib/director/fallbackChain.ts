/**
 * Phase 16 — Fallback Guarantee: tiered component resolution per trigger type.
 */

import { isComponentBuilt } from "./auditCoverage";

export const UNIVERSAL_FALLBACKS = ["topic_title_card", "pull_quote_card"] as const;

/** Ordered fallback tiers per trigger type (ideal first, universal last). */
export const FALLBACK_TIERS: Record<string, readonly string[]> = {
  topic_shift: ["chapter_marker", "corporate_timeline", "bullet_list_reveal", "topic_title_card", "pull_quote_card"],
  high_emphasis_moment: ["quote_callout", "pull_quote_card", "icon_point_callout"],
  comparison_phrase: ["comparison_chart", "comparison_table", "bullet_list_reveal", "topic_title_card"],
  stat_mention: ["metric_ticker", "icon_point_callout", "topic_title_card"],
  speaker_change: ["active_speaker_split", "icon_point_callout"],
  sustained_speech: ["symmetric_audio_strip", "topic_title_card"],
  episode_start: ["broadcast_lower_third", "topic_title_card"],
  hook_phrase: ["kinetic_text", "pull_quote_card"],
  cta_phrase: ["subscribe_badge", "icon_point_callout"],
  kinetic_caption: ["kinetic_karaoke", "pull_quote_card"],
  screen_recording_segment: ["device_mockup", "topic_title_card"],
  feature_callout_phrase: ["dynamic_feature_callout", "icon_point_callout"],
  talking_head_segment: ["focus_frame", "topic_title_card"],
};

export interface FallbackResolution {
  componentId: string;
  fallbackTier: "ideal" | "tier_1" | "tier_2" | "universal";
  usedFallback: boolean;
}

function tierLabel(index: number, idealIndex: number): FallbackResolution["fallbackTier"] {
  if (index === idealIndex) return "ideal";
  if (index === idealIndex + 1) return "tier_1";
  if (index === idealIndex + 2) return "tier_2";
  return "universal";
}

/** Pick the first built component in the fallback chain for a trigger. */
export function resolveComponentWithFallback(
  triggerType: string,
  idealComponentId: string,
): FallbackResolution {
  const chain = [
    idealComponentId,
    ...(FALLBACK_TIERS[triggerType] ?? []).filter((id) => id !== idealComponentId),
    ...UNIVERSAL_FALLBACKS.filter((id) => id !== idealComponentId),
  ];

  const seen = new Set<string>();
  const ordered = chain.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const idealIndex = ordered.indexOf(idealComponentId);
  for (let i = 0; i < ordered.length; i++) {
    const componentId = ordered[i]!;
    if (isComponentBuilt(componentId) || componentId in COMPLETENESS_BUILT) {
      return {
        componentId,
        fallbackTier: tierLabel(i, idealIndex >= 0 ? idealIndex : 0),
        usedFallback: componentId !== idealComponentId,
      };
    }
  }

  return {
    componentId: "topic_title_card",
    fallbackTier: "universal",
    usedFallback: true,
  };
}

/** Completeness components are always available once Phase 16 ships. */
const COMPLETENESS_BUILT: Record<string, true> = {
  topic_title_card: true,
  icon_point_callout: true,
  bullet_list_reveal: true,
  comparison_table: true,
  pull_quote_card: true,
};

/** B-roll failure fallback — podcast topic shifts without stock footage. */
export function brollFailureFallbackComponent(
  triggerType: string,
  props?: Record<string, unknown>,
): string {
  const text = String(props?.text ?? props?.label ?? "").trim();
  if (triggerType === "high_emphasis_moment" || text.length > 40) {
    return "pull_quote_card";
  }
  return "topic_title_card";
}
