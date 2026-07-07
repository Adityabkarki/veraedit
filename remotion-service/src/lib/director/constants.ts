import type { DirectorContentType, GraphicsDensity } from "@types/timeline";

/** Rolling window for density throttling (seconds). */
export const DENSITY_WINDOW_SECONDS = 10;

/** Max realized triggers per window by density level. */
export const DENSITY_LIMITS: Record<GraphicsDensity, number> = {
  minimalist: 1,
  balanced: 2,
  immersive: 4,
};

/** Layer Depth Registry bands (skills.md). */
export const LAYER_BANDS = {
  background: { min: 0, max: 10 },
  content: { min: 10, max: 45 },
  overlay: { min: 45, max: 70 },
  vfx: { min: 70, max: 85 },
  chrome: { min: 85, max: 100 },
} as const;

/** Default layer depth per component type. */
export const COMPONENT_LAYER_DEPTH: Record<string, number> = {
  active_speaker_split: 25,
  broadcast_lower_third: 55,
  name_plate: 55,
  symmetric_audio_strip: 58,
  circular_orbit_equalizer: 58,
  quote_callout: 62,
  kinetic_karaoke: 65,
  kinetic_text: 65,
  animated_title: 60,
  stat_counter: 35,
  metric_ticker: 35,
  glass_card: 32,
  bar_chart: 30,
  line_chart: 30,
  comparison_chart: 30,
  funnel_chart: 30,
  strategy_funnel: 28,
  corporate_timeline: 28,
  timeline_flow: 28,
  device_mockup: 30,
  dynamic_feature_callout: 55,
  feature_callout: 55,
  subscribe_badge: 90,
  cta_badge: 90,
  topic_title_card: 18,
  pull_quote_card: 62,
  icon_point_callout: 66,
  bullet_list_reveal: 32,
  comparison_table: 30,
};

export const DEFAULT_LAYER_DEPTH = 40;

/** Map trigger types to default component IDs per content pillar. */
export const TRIGGER_COMPONENT_MAP: Record<
  string,
  Partial<Record<DirectorContentType, string>>
> = {
  speaker_change: { podcast: "active_speaker_split" },
  episode_start: { podcast: "broadcast_lower_third" },
  sustained_speech: { podcast: "symmetric_audio_strip" },
  high_emphasis_moment: {
    podcast: "quote_callout",
    social: "kinetic_text",
  },
  stat_mention: { consultancy: "metric_ticker" },
  topic_shift: {
    consultancy: "corporate_timeline",
    social: "animated_title",
    podcast: "chapter_marker",
  },
  comparison_phrase: { consultancy: "comparison_chart" },
  hook_phrase: { social: "kinetic_text" },
  cta_phrase: { social: "subscribe_badge" },
  screen_recording_segment: { showcase: "device_mockup" },
  feature_callout_phrase: { showcase: "dynamic_feature_callout" },
  talking_head_segment: { showcase: "focus_frame" },
  kinetic_caption: { social: "kinetic_karaoke" },
};

export const CTA_PHRASES = [
  "follow",
  "link in bio",
  "subscribe",
  "like and share",
  "comment below",
  "hit the bell",
];

export const COMPARISON_PHRASES = [
  "compared to",
  "versus",
  " vs ",
  "against",
  "relative to",
];

export const FEATURE_CALLOUT_PHRASES = [
  "as you can see",
  "this button",
  "swipe to",
  "click here",
  "tap on",
  "right here",
  "on the screen",
];

export const SCREEN_RECORDING_PHRASES = [
  "on the screen",
  "in the app",
  "this dashboard",
  "the interface",
  "screen recording",
  "demo",
];
