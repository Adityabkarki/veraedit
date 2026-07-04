/**
 * Aesthetic blueprints — spring profiles + Devanagari-safe text.
 * Keep in lockstep with remotion-service/src/motion/motionBlueprints.ts
 */

import type { CSSProperties } from 'react'
import { containsDevanagari } from '@/lib/motionMath'

export const SPRING_SOCIAL = { mass: 0.5, damping: 10, stiffness: 150 }
export const SPRING_CORPORATE = { mass: 1.0, damping: 25, stiffness: 80 }
export const SPRING_PRODUCT = { mass: 0.7, damping: 14, stiffness: 160 }
export const SPRING_DEFAULT = { mass: 1.0, damping: 14, stiffness: 180 }

export type BlueprintFamily = 'social' | 'corporate' | 'product' | 'default'

const FAMILY_BY_TYPE: Record<string, BlueprintFamily> = {
  voice_waveform: 'social',
  eq_visualizer: 'social',
  circular_waveform: 'social',
  soundbite: 'social',
  karaoke_caption: 'social',
  subscribe_badge: 'social',
  social_frame: 'social',
  guest_intro: 'social',
  name_plate: 'social',
  broadcast_lower_third: 'social',
  lower_third_pro: 'social',
  bar_chart: 'corporate',
  line_chart: 'corporate',
  corporate_timeline: 'corporate',
  glass_card: 'corporate',
  animated_title: 'corporate',
  device_mockup: 'product',
  product_highlight: 'product',
  product_reveal: 'product',
  callout_line: 'product',
  feature_callout: 'product',
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

/** Devanagari-safe text style — extra line-height so matras are never clipped. */
export function textLayerStyle(
  text: string,
  extras: CSSProperties = {},
): CSSProperties {
  const dev = containsDevanagari(text)
  return {
    fontFamily: dev ? 'Noto Sans Devanagari, sans-serif' : 'inherit',
    lineHeight: dev ? 1.55 : 1.25,
    paddingTop: dev ? '0.2em' : 0,
    paddingBottom: dev ? '0.25em' : 0,
    overflow: 'visible',
    ...extras,
  }
}
