/**
 * One-tap atomic presets — mirrors remotion-service presets/definitions.ts
 * for offline UI / Magic Mode labels.
 */

export type AtomicPresetId =
  | 'podcast'
  | 'consultancy'
  | 'social'
  | 'product_showcase'

export interface AtomicPresetMeta {
  id: AtomicPresetId
  label: string
  hint: string
  forcedCurve: 'snappy_spring' | 'elegant_glide' | 'elastic_overshoot'
  width: number
  height: number
  /** Primary component types injected by this preset */
  components: string[]
}

export const ATOMIC_PRESETS: AtomicPresetMeta[] = [
  {
    id: 'podcast',
    label: 'Podcast',
    hint: 'Dual speakers, EQ rails, lower thirds',
    forcedCurve: 'elegant_glide',
    width: 1920,
    height: 1080,
    components: [
      'active_speaker_split',
      'circular_orbit_equalizer',
      'symmetric_audio_strip',
      'broadcast_lower_third',
    ],
  },
  {
    id: 'consultancy',
    label: 'Consultancy',
    hint: 'Self-drawing funnels, glass metrics, timelines',
    forcedCurve: 'elegant_glide',
    width: 1920,
    height: 1080,
    components: [
      'animated_title',
      'strategy_funnel',
      'metric_ticker',
      'corporate_timeline',
      'progress_timer',
    ],
  },
  {
    id: 'social',
    label: 'Social',
    hint: '9:16 karaoke, scribbles, vertical safe zones',
    forcedCurve: 'snappy_spring',
    width: 1080,
    height: 1920,
    components: ['vertical_clip_template', 'kinetic_karaoke', 'scribble_annotation'],
  },
  {
    id: 'product_showcase',
    label: 'Product Showcase',
    hint: '3D device frame, tracking callouts, gloss overlay',
    forcedCurve: 'elastic_overshoot',
    width: 1920,
    height: 1080,
    components: ['device_mockup', 'dynamic_feature_callout'],
  },
]

/** Map Magic Mode preset id → atomic preset id (when one-tap stack applies). */
export const MAGIC_TO_ATOMIC: Record<string, AtomicPresetId> = {
  podcast: 'podcast',
  interview: 'podcast',
  consultancy: 'consultancy',
  pitch: 'consultancy',
  minimal: 'consultancy',
  social: 'social',
  social_reel: 'social',
  product: 'product_showcase',
  launch: 'product_showcase',
  demo: 'product_showcase',
}

export function atomicPresetForMagicId(magicId: string): AtomicPresetMeta | undefined {
  const atomicId = MAGIC_TO_ATOMIC[magicId]
  if (!atomicId) return undefined
  return ATOMIC_PRESETS.find((p) => p.id === atomicId)
}
