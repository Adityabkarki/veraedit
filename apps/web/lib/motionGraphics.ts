/**
 * Motion graphic overlay types — data cards, arrows, conflict highlights.
 */

import type { Clip } from '@/stores/timelineStore'
import { isFamilyTrack } from '@/lib/timelineLayers'

export const MOTION_GRAPHIC_TYPES = new Set([
  'data_card',
  'arrow_flow',
  'conflict_box',
  'upper_third_label',
])

export function isMotionGraphicClip(clip: Clip | undefined): boolean {
  if (!clip || !isFamilyTrack(clip.trackId, 'overlay')) return false
  const vt = (clip.effects?.visualType ?? '').toLowerCase()
  return MOTION_GRAPHIC_TYPES.has(vt)
}

export function motionGraphicLabel(visualType: string): string {
  switch (visualType) {
    case 'data_card':
      return 'Data card'
    case 'arrow_flow':
      return 'Arrow'
    case 'conflict_box':
      return 'Conflict highlight'
    case 'upper_third_label':
      return 'Context label'
    default:
      return 'Motion graphic'
  }
}

/** Sensible defaults when inserting from the toolbox (user edits immediately). */
export const MOTION_GRAPHIC_DEFAULTS: Record<
  string,
  Record<string, string | number | boolean>
> = {
  data_card: {
    displayValue: '12,500',
    secondaryText: 'Metric label',
    xPct: 78,
    yPct: 22,
    widthPct: 32,
    scale: 1,
  },
  arrow_flow: {
    displayValue: '',
    xPct: 62,
    yPct: 48,
    widthPct: 26,
    heightPct: 8,
    rotation: 0,
    scale: 1,
    arrowStyle: 'curved',
  },
  conflict_box: {
    displayValue: '',
    secondaryText: '',
    xPct: 50,
    yPct: 42,
    widthPct: 42,
    heightPct: 28,
    scale: 1,
    conflictTone: 'dual',
  },
  upper_third_label: {
    displayValue: '',
    xPct: 50,
    yPct: 18,
    scale: 1,
  },
}
