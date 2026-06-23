/**
 * Effect keyframe math and preview resolution.
 */

import type { Clip, EffectKeyframe } from '@/stores/timelineStore'
import { COLOR_FILTERS } from '@/stores/effectsStore'

export type EffectPropertyType = 'filter' | 'speed' | 'opacity'

export interface ResolvedEffectPreview {
  filterCss: string
  filterIntensity: number
  speedMultiplier: number
  opacity: number
  vignetteStrength: number
}

/** Build CSS filter from style-toolbox color grade fields. */
export function filterCssFromToolboxEffects(effects: Clip['effects'] | undefined): string {
  if (!effects) return 'none'
  if (effects.colorFilterCss && effects.colorFilterCss !== 'none') return effects.colorFilterCss
  const { contrast, exposure, clarity } = effects
  if (contrast == null && exposure == null && clarity == null) return 'none'
  const c = 1 + (contrast ?? 0)
  const b = 1 + (exposure ?? 0)
  const s = 1 + (clarity ?? 0) * 0.5
  return `contrast(${c}) brightness(${b}) saturate(${s})`
}

/** Vignette strength (0–1) from active VFX clips at playhead time. */
export function activeVignetteStrength(clips: Clip[], time: number): number {
  let strength = 0
  for (const fx of activeEffectClipsAt(clips, time)) {
    if (fx.effects?.vfx === 'vignette') {
      strength = Math.max(strength, fx.effects.vignette_amount ?? 0.35)
    }
  }
  return strength
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3)
}

/** Interpolate numeric keyframes at local time (seconds from effect clip start). */
export function interpolateKeyframes(
  keyframes: EffectKeyframe[] | undefined,
  localTime: number,
  fallback = 1,
  easing: 'linear' | 'ease-out' = 'linear',
): number {
  if (!keyframes || keyframes.length === 0) return fallback
  const sorted = [...keyframes].sort((a, b) => a.offset - b.offset)
  if (localTime <= sorted[0].offset) return sorted[0].value
  const last = sorted[sorted.length - 1]
  if (localTime >= last.offset) return last.value

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (localTime >= a.offset && localTime <= b.offset) {
      const span = b.offset - a.offset
      if (span <= 0) return b.value
      let t = (localTime - a.offset) / span
      if (easing === 'ease-out') t = easeOutCubic(t)
      return a.value + t * (b.value - a.value)
    }
  }
  return last.value
}

function isEffectLaneClip(c: Clip): boolean {
  return (
    (c.trackId === 'effects' || c.trackId === 'camera') &&
    c.type === 'effect'
  )
}

/** Effect clips active at absolute timeline time. */
export function activeEffectClipsAt(clips: Clip[], time: number): Clip[] {
  return clips.filter(
    (c) =>
      isEffectLaneClip(c) &&
      time >= c.startTime &&
      time < c.startTime + c.duration,
  )
}

/** Whether keyframe offsets are normalized 0–1 (vs seconds). */
export function keyframesUseNormalizedOffsets(keyframes: EffectKeyframe[]): boolean {
  if (keyframes.length === 0) return true
  return Math.max(...keyframes.map((k) => k.offset)) <= 1.5
}

/** Local time for keyframe lookup on an effect clip. */
export function effectKeyframeLocalTime(fx: Clip, time: number): number {
  const kfs = fx.effects?.keyframes ?? []
  const localSec = Math.max(0, time - fx.startTime)
  if (keyframesUseNormalizedOffsets(kfs)) {
    return localSec / Math.max(fx.duration, 0.01)
  }
  return localSec
}

function isZoomEffectClip(fx: Clip): boolean {
  const type = fx.effects?.effectType ?? ''
  const preset = fx.effects?.effectPresetId ?? ''
  const tool = fx.effects?.styleToolId ?? ''
  return (
    type === 'digital_zoom' ||
    type === 'transform' ||
    preset === 'digital_zoom_punch' ||
    preset === 'ken_burns' ||
    tool.includes('zoom')
  )
}

/** Preview scale from active Effects-track zoom clips or embedded video keyframes. */
export function resolveZoomScaleAt(
  clips: Clip[],
  time: number,
  videoClip?: Clip,
): number {
  for (const fx of activeEffectClipsAt(clips, time)) {
    if (!isZoomEffectClip(fx) || !fx.effects?.keyframes?.length) continue
    const local = effectKeyframeLocalTime(fx, time)
    const easing = fx.effects.zoomEasing ?? 'linear'
    return interpolateKeyframes(fx.effects.keyframes, local, 1, easing)
  }

  if (videoClip?.effects?.keyframes?.length) {
    const preset = videoClip.effects.effectPresetId ?? ''
    if (preset === 'digital_zoom_punch' || preset === 'ken_burns') {
      const local =
        (time - videoClip.startTime) / Math.max(videoClip.duration, 0.01)
      return interpolateKeyframes(videoClip.effects.keyframes, local, 1)
    }
  }

  return 1
}

/** Compose preview values from effect clips + base video clip at timeline time. */
export function resolveEffectPreviewAt(
  clips: Clip[],
  time: number,
  baseVideoClip?: Clip,
): ResolvedEffectPreview {
  let filterCss = baseVideoClip?.effects?.colorFilterCss ?? 'none'
  let filterIntensity = filterCss !== 'none' ? 1 : 0
  let speedMultiplier = baseVideoClip?.speed ?? 1
  let opacity = 1
  let vignetteStrength = 0

  const activeEffects = activeEffectClipsAt(clips, time)
  for (const fx of activeEffects) {
    const local = time - fx.startTime
    const type = fx.effects?.effectType ?? 'filter'
    const value = interpolateKeyframes(fx.effects?.keyframes, local, 1)

    if (type === 'filter') {
      const css = filterCssFromToolboxEffects(fx.effects)
      if (css !== 'none' && value > filterIntensity) {
        filterCss = css
        filterIntensity = value
      }
    } else if (type === 'speed') {
      speedMultiplier *= value > 0 ? value : 1
    } else if (type === 'opacity') {
      opacity *= Math.max(0, Math.min(1, value))
    }

    if (fx.effects?.vfx === 'vignette') {
      vignetteStrength = Math.max(vignetteStrength, fx.effects.vignette_amount ?? 0.35)
    }
  }

  return { filterCss, filterIntensity, speedMultiplier, opacity, vignetteStrength }
}

/** Default keyframes: ramp from start value → end value across clip duration. */
export function defaultKeyframes(
  duration: number,
  startValue: number,
  endValue: number,
): EffectKeyframe[] {
  const dur = Math.max(0.1, duration)
  return [
    { offset: 0, value: startValue },
    { offset: dur, value: endValue },
  ]
}

export function effectClipLabel(
  effectType: EffectPropertyType,
  presetId: string,
  presetName?: string,
): string {
  const name = presetName ?? presetId
  const icon =
    effectType === 'filter' ? '🎨' : effectType === 'speed' ? '⚡' : '◐'
  return `${icon} ${name}`
}

export function filterCssForPreset(presetId: string): string {
  return COLOR_FILTERS.find((f) => f.id === presetId)?.cssFilter ?? 'none'
}

/** Scale filter application by intensity (0 = none, 1 = full). */
export function filterStyleForIntensity(cssFilter: string, intensity: number): string | undefined {
  if (!cssFilter || cssFilter === 'none' || intensity <= 0) return undefined
  if (intensity >= 0.99) return cssFilter
  const blend = Math.round(intensity * 100)
  return `${cssFilter} brightness(${100 + (1 - intensity) * 20}%) saturate(${50 + blend / 2}%)`
}
