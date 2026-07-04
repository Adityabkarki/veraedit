/**
 * Motion graphic clip editing — sync motionProps ↔ display fields, placement metadata.
 */

import type { Clip } from '@/stores/timelineStore'
import type { ClipEffects } from '@/stores/timelineStore'
import { getMotionGraphicDef } from '@/lib/motionGraphicsLibrary'

/** Types that use x/y placement and canvas drag (via PositionedOverlay). */
export const POSITIONABLE_MOTION_TYPES = new Set([
  'animated_title',
  'kinetic_text',
  'stat_counter',
  'quote_callout',
  'cta_badge',
  'arrow_callout',
  'particle_burst',
  'lower_third_pro',
])

/** Full-frame types — no x/y placement. */
export const FULLSCREEN_MOTION_TYPES = new Set([
  'end_card',
  'background_gradient',
  'shape_transition',
])

/** Bottom-anchored bar types. */
export const FIXED_BOTTOM_MOTION_TYPES = new Set(['progress_timer'])

export function motionGraphicUsesPosition(type: string): boolean {
  return POSITIONABLE_MOTION_TYPES.has(type.toLowerCase())
}

export function motionGraphicIsFullscreen(type: string): boolean {
  return FULLSCREEN_MOTION_TYPES.has(type.toLowerCase())
}

export const MOTION_ANIMATION_LABELS: Record<string, string> = {
  word_pop: 'Word pop',
  slide_up: 'Slide up',
  slide_down: 'Slide down',
  slide_left: 'Slide left',
  blur_in: 'Blur in',
  scale_bounce: 'Scale bounce',
  pop: 'Pop',
  rotate_in: 'Rotate in',
  fade: 'Fade',
  fade_up: 'Fade up',
  count_up: 'Count up',
  pop_pulse: 'Pop pulse',
  fill: 'Fill',
  burst: 'Burst',
  wipe: 'Wipe',
  draw: 'Draw',
  rise: 'Rise',
}

export const POSITION_PRESETS: Array<{
  id: string
  label: string
  xPct: number
  yPct: number
}> = [
  { id: 'top', label: 'Top', xPct: 50, yPct: 18 },
  { id: 'upper', label: 'Upper third', xPct: 50, yPct: 28 },
  { id: 'center', label: 'Center', xPct: 50, yPct: 50 },
  { id: 'lower', label: 'Lower third', xPct: 50, yPct: 72 },
  { id: 'bottom', label: 'Bottom', xPct: 50, yPct: 85 },
  { id: 'left', label: 'Left', xPct: 22, yPct: 50 },
  { id: 'right', label: 'Right', xPct: 78, yPct: 50 },
]

export function readMotionProps(clip: Clip): Record<string, unknown> {
  const base = { ...(clip.effects?.motionProps as Record<string, unknown> | undefined) }
  const vt = (clip.effects?.visualType ?? '').toLowerCase()

  if (base.text == null && clip.effects?.displayValue) {
    base.text = clip.effects.displayValue
  }
  if (base.title == null && clip.effects?.displayValue) {
    base.title = clip.effects.displayValue
  }
  if (base.subtitle == null && clip.effects?.secondaryText) {
    base.subtitle = clip.effects.secondaryText
  }
  if (base.label == null && clip.effects?.secondaryText) {
    base.label = clip.effects.secondaryText
  }
  if (base.author == null && clip.effects?.secondaryText && vt === 'quote_callout') {
    base.author = clip.effects.secondaryText
  }
  if (base.brandColor == null && clip.effects?.brandColor) {
    base.brandColor = clip.effects.brandColor
  }
  return base
}

type MotionPatch = Partial<ClipEffects> & { motionProps?: Record<string, unknown> }

/** Merge a patch into clip effects, keeping motionProps and display fields in sync. */
export function buildMotionGraphicPatch(
  clip: Clip,
  patch: MotionPatch,
): Partial<ClipEffects> {
  const vt = (clip.effects?.visualType ?? '').toLowerCase()
  const nextProps = {
    ...readMotionProps(clip),
    ...(patch.motionProps ?? {}),
  }

  const out: Partial<ClipEffects> = { ...patch }
  delete (out as { motionProps?: unknown }).motionProps

  if (patch.motionProps || patch.displayValue != null || patch.secondaryText != null) {
    out.motionProps = nextProps

    if (patch.displayValue != null) {
      if ('text' in nextProps || vt.includes('text') || vt === 'animated_title' || vt === 'quote_callout' || vt === 'cta_badge' || vt === 'arrow_callout') {
        nextProps.text = patch.displayValue
      }
      if ('title' in nextProps || vt === 'lower_third_pro' || vt === 'end_card') {
        nextProps.title = patch.displayValue
      }
      out.motionProps = { ...nextProps }
    }

    if (patch.secondaryText != null) {
      if (vt === 'quote_callout') nextProps.author = patch.secondaryText
      else if (vt === 'stat_counter' || vt === 'progress_timer') nextProps.label = patch.secondaryText
      else nextProps.subtitle = patch.secondaryText
      out.motionProps = { ...nextProps }
    }
  }

  if (patch.motionProps) {
    const p = patch.motionProps
    if (p.text != null) out.displayValue = String(p.text)
    if (p.title != null) out.displayValue = String(p.title)
    if (p.subtitle != null) out.secondaryText = String(p.subtitle)
    if (p.label != null) out.secondaryText = String(p.label)
    if (p.author != null) out.secondaryText = String(p.author)
    if (p.brandColor != null) out.brandColor = String(p.brandColor)
  }

  return out
}

export function animationOptionsForType(type: string): { enter: string[]; exit: string[] } {
  const def = getMotionGraphicDef(type)
  return def?.animations ?? { enter: ['fade'], exit: ['fade'] }
}

export function formatAnimationLabel(id: string): string {
  return MOTION_ANIMATION_LABELS[id] ?? id.replace(/_/g, ' ')
}
