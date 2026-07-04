/**
 * Aesthetic blueprints — spring profiles + Devanagari-safe text.
 * Keep in lockstep with remotion-service/src/motion/motionBlueprints.ts
 * Physics Constant Manifest (skills.md).
 */

import type { CSSProperties } from 'react'
import { containsDevanagari } from '@/lib/motionMath'

/** snappy_spring */
export const SPRING_SOCIAL = { mass: 0.4, damping: 12, stiffness: 180 }
/** elegant_glide */
export const SPRING_CORPORATE = { mass: 1.0, damping: 24, stiffness: 90 }
/** elastic_overshoot */
export const SPRING_PRODUCT = { mass: 0.7, damping: 8, stiffness: 140 }
export const SPRING_DEFAULT = { mass: 1.0, damping: 24, stiffness: 90 }

export type BlueprintFamily = 'social' | 'corporate' | 'product' | 'default'

const FAMILY_BY_TYPE: Record<string, BlueprintFamily> = {
  voice_waveform: 'social',
  eq_visualizer: 'corporate',
  symmetric_audio_strip: 'corporate',
  circular_waveform: 'corporate',
  circular_orbit_equalizer: 'corporate',
  active_speaker_split: 'corporate',
  soundbite: 'social',
  karaoke_caption: 'social',
  kinetic_karaoke: 'social',
  subscribe_badge: 'social',
  social_frame: 'social',
  vertical_clip_template: 'social',
  scribble_annotation: 'social',
  doodle_scribble: 'social',
  guest_intro: 'social',
  name_plate: 'social',
  broadcast_lower_third: 'social',
  lower_third_pro: 'social',
  bar_chart: 'corporate',
  line_chart: 'corporate',
  corporate_timeline: 'corporate',
  strategy_funnel: 'corporate',
  funnel_chart: 'corporate',
  metric_ticker: 'corporate',
  glass_card: 'corporate',
  animated_title: 'corporate',
  device_mockup: 'product',
  product_highlight: 'product',
  product_reveal: 'product',
  callout_line: 'product',
  feature_callout: 'product',
  dynamic_feature_callout: 'product',
}

export function blueprintFamily(typeId: string): BlueprintFamily {
  return FAMILY_BY_TYPE[typeId] ?? 'default'
}

export function springForType(typeId: string): {
  mass: number
  damping: number
  stiffness: number
} {
  const family = blueprintFamily(typeId)
  if (family === 'social') return { ...SPRING_SOCIAL }
  if (family === 'corporate') return { ...SPRING_CORPORATE }
  if (family === 'product') return { ...SPRING_PRODUCT }
  return { ...SPRING_DEFAULT }
}

/** Devanagari-safe text style — content-box + py-[0.25em] minimum. */
export function textLayerStyle(
  text: string,
  extras: CSSProperties = {},
): CSSProperties {
  const dev = containsDevanagari(text)
  return {
    fontFamily: dev ? 'Noto Sans Devanagari, sans-serif' : 'inherit',
    boxSizing: 'content-box',
    lineHeight: dev ? 1.55 : 1.25,
    paddingTop: '0.25em',
    paddingBottom: '0.25em',
    overflow: 'visible',
    ...extras,
  }
}
