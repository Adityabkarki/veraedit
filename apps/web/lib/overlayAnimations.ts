/**
 * Entrance / exit motion presets for text & overlay elements.
 */

import type { Clip } from '@/stores/timelineStore'

export type OverlayMotionPreset =
  | 'none'
  | 'fade_in'
  | 'fade_out'
  | 'slide_in_left'
  | 'slide_in_right'
  | 'slide_in_up'
  | 'slide_in_down'
  | 'slide_out_left'
  | 'slide_out_right'
  | 'slide_out_up'
  | 'slide_out_down'

export const OVERLAY_ENTRANCE_OPTIONS: { id: OverlayMotionPreset; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade_in', label: 'Fade in' },
  { id: 'slide_in_left', label: 'Slide in from left' },
  { id: 'slide_in_right', label: 'Slide in from right' },
  { id: 'slide_in_up', label: 'Slide in from bottom' },
  { id: 'slide_in_down', label: 'Slide in from top' },
]

export const OVERLAY_EXIT_OPTIONS: { id: OverlayMotionPreset; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade_out', label: 'Fade out' },
  { id: 'slide_out_left', label: 'Slide out to left' },
  { id: 'slide_out_right', label: 'Slide out to right' },
  { id: 'slide_out_up', label: 'Slide out upward' },
  { id: 'slide_out_down', label: 'Slide out downward' },
]

const ENTRANCE_PRESETS = new Set<OverlayMotionPreset>([
  'fade_in',
  'slide_in_left',
  'slide_in_right',
  'slide_in_up',
  'slide_in_down',
])

const EXIT_PRESETS = new Set<OverlayMotionPreset>([
  'fade_out',
  'slide_out_left',
  'slide_out_right',
  'slide_out_up',
  'slide_out_down',
])

function slideOffset(preset: OverlayMotionPreset, amount: number): { x: number; y: number } {
  switch (preset) {
    case 'slide_in_left':
    case 'slide_out_left':
      return { x: -amount, y: 0 }
    case 'slide_in_right':
    case 'slide_out_right':
      return { x: amount, y: 0 }
    case 'slide_in_up':
    case 'slide_out_up':
      return { x: 0, y: amount }
    case 'slide_in_down':
    case 'slide_out_down':
      return { x: 0, y: -amount }
    default:
      return { x: 0, y: 0 }
  }
}

/** Scrub-synced opacity + transform for overlay entrance/exit at timeline time. */
export function computeOverlayMotion(
  clip: Clip,
  time: number,
): { opacity: number; motionTransform: string } {
  const start = clip.startTime
  const end = start + clip.duration
  if (time < start || time >= end) {
    return { opacity: 0, motionTransform: '' }
  }

  const local = time - start
  const duration = Math.max(0.1, clip.duration)
  const inDur = Math.min(
    clip.effects?.entranceDuration ?? Math.min(0.55, duration * 0.22),
    duration * 0.5,
  )
  const outDur = Math.min(
    clip.effects?.exitDuration ?? Math.min(0.55, duration * 0.22),
    duration * 0.5,
  )
  const outStart = duration - outDur

  const entrance = (clip.effects?.overlayEntrance ?? 'fade_in') as OverlayMotionPreset
  const exit = (clip.effects?.overlayExit ?? 'none') as OverlayMotionPreset

  let opacity = 1
  let offsetX = 0
  let offsetY = 0

  if (ENTRANCE_PRESETS.has(entrance) && local < inDur) {
    const t = local / inDur
    if (entrance === 'fade_in') {
      opacity = t
    } else {
      const off = slideOffset(entrance, 18 * (1 - t))
      offsetX = off.x
      offsetY = off.y
      opacity = t
    }
  }

  if (EXIT_PRESETS.has(exit) && local >= outStart) {
    const t = (local - outStart) / outDur
    if (exit === 'fade_out') {
      opacity = Math.min(opacity, 1 - t)
    } else {
      const off = slideOffset(exit, 18 * t)
      offsetX += off.x
      offsetY += off.y
      opacity = Math.min(opacity, 1 - t)
    }
  }

  const motionTransform =
    offsetX !== 0 || offsetY !== 0
      ? `translate(${offsetX}%, ${offsetY}%)`
      : ''

  return { opacity, motionTransform }
}

export function defaultEntranceForVisualType(visualType?: string): OverlayMotionPreset {
  const vt = (visualType ?? '').toLowerCase()
  if (vt === 'data_card' || vt === 'title_banner' || vt === 'hook_banner') {
    return 'slide_in_up'
  }
  if (vt === 'cta' || vt === 'key_term') {
    return 'fade_in'
  }
  return 'fade_in'
}
