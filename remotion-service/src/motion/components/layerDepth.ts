/**
 * Layer Depth Registry — skills.md.
 * Presets combining atoms must never collide within a band.
 */

export type LayerBand = "background" | "content" | "graphics_overlay" | "ui_chrome";

export const LAYER_BANDS: Record<LayerBand, { min: number; max: number }> = {
  background: { min: 0, max: 10 },
  content: { min: 10, max: 50 },
  graphics_overlay: { min: 50, max: 80 },
  ui_chrome: { min: 80, max: 100 },
};

/** Canonical depths for atomic components (unique within each preset). */
export const ATOMIC_LAYER_DEPTH = {
  // Background 0–10
  background_plate: 0,
  background_gradient: 2,
  // Content 10–50
  active_speaker_split: 12,
  device_mockup_3d: 18,
  strategy_funnel: 22,
  corporate_timeline: 26,
  vertical_clip_template: 14,
  // Graphics Overlay 50–80
  circular_orbit_equalizer: 52,
  symmetric_audio_strip: 54,
  metric_ticker: 56,
  kinetic_karaoke: 60,
  scribble_annotation: 62,
  dynamic_feature_callout: 66,
  // UI Chrome 80–100
  subscribe_badge: 82,
  safe_zone_guide: 90,
} as const;

export type AtomicLayerKey = keyof typeof ATOMIC_LAYER_DEPTH;

export function assertLayerInBand(depth: number, band: LayerBand): boolean {
  const { min, max } = LAYER_BANDS[band];
  return depth >= min && depth < max;
}
