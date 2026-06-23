/**
 * Short vertical framing — pan/crop math for 9:16 from 16:9 source.
 */

export type ShortFramingMode = 'auto' | 'manual'

export interface ShortFraming {
  /** Horizontal crop position: 0 = left, 0.5 = center, 1 = right */
  panX: number
  mode: ShortFramingMode
  /** From backend reframe plan (center_crop, speaker_track, …) */
  reframeStrategy?: string
}

export const DEFAULT_SHORT_FRAMING: ShortFraming = {
  panX: 0.5,
  mode: 'auto',
}

/** CSS object-position for 16:9 video cropped to 9:16 via object-cover. */
export function shortPreviewObjectPosition(panX: number): string {
  const x = Math.round(Math.max(0, Math.min(1, panX)) * 100)
  return `${x}% center`
}

/** Optional zoom for speaker_track strategy (slight punch-in). */
export function shortPreviewScale(strategy?: string): number {
  return strategy === 'speaker_track' ? 1.05 : 1
}

/** FFmpeg vf chain: crop 9:16 window at panX then scale to output. */
export function shortCropFilter(
  panX: number,
  outWidth = 1080,
  outHeight = 1920,
): string {
  const px = Math.max(0, Math.min(1, panX))
  return (
    `crop=ih*9/16:ih:(iw-ih*9/16)*${px.toFixed(4)}:0,` +
    `scale=${outWidth}:${outHeight},setsar=1`
  )
}

/** Derive initial framing from API reframe metadata. */
export function framingFromReframe(reframe: Record<string, unknown> | undefined): ShortFraming {
  if (!reframe) return { ...DEFAULT_SHORT_FRAMING }
  const strategy = String(reframe.strategy ?? 'center_crop')
  return {
    panX: 0.5,
    mode: 'auto',
    reframeStrategy: strategy,
  }
}

export function labelForPan(panX: number): string {
  if (panX < 0.25) return 'Left'
  if (panX > 0.75) return 'Right'
  if (panX > 0.4 && panX < 0.6) return 'Center'
  return 'Custom'
}
