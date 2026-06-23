/**
 * Multicam / split-screen / PiP layout resolved from Effects-track clips.
 */

import type { Clip } from '@/stores/timelineStore'
import { isBrollClip, isImageClip } from '@/lib/mediaClips'
import { isFamilyTrack } from '@/lib/timelineLayers'

export type VideoLayoutMode = 'normal' | 'split_screen' | 'picture_in_picture'

export interface ActiveVideoLayout {
  mode: VideoLayoutMode
  /** B-roll or image clip used as the secondary panel (split / PiP). */
  secondaryClip?: Clip
  pipScale: number
  pipCorner: 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left'
}

export function activeVideoLayout(clips: Clip[], time: number): ActiveVideoLayout {
  const layoutClip = clips.find(
    (c) =>
      c.trackId === 'effects' &&
      c.effects?.effectType === 'layout' &&
      time >= c.startTime &&
      time < c.startTime + c.duration,
  )

  if (!layoutClip) {
    return { mode: 'normal', pipScale: 0.28, pipCorner: 'bottom-right' }
  }

  const layout = String(layoutClip.effects?.layout ?? '')
  const secondary = findSecondarySource(clips, time)

  if (layout === 'split_screen') {
    return { mode: 'split_screen', secondaryClip: secondary, pipScale: 0.5, pipCorner: 'bottom-right' }
  }
  if (layout === 'picture_in_picture') {
    return {
      mode: 'picture_in_picture',
      secondaryClip: secondary,
      pipScale: Number(layoutClip.effects?.pipScale ?? 0.28),
      pipCorner: (layoutClip.effects?.pipCorner as ActiveVideoLayout['pipCorner']) ?? 'bottom-right',
    }
  }

  return { mode: 'normal', pipScale: 0.28, pipCorner: 'bottom-right' }
}

function findSecondarySource(clips: Clip[], time: number): Clip | undefined {
  const candidates = clips.filter((c) => {
    if (time < c.startTime || time >= c.startTime + c.duration) return false
    if (isBrollClip(c)) return true
    if (isImageClip(c)) return true
    if (isFamilyTrack(c.trackId, 'broll')) return Boolean(c.effects?.mediaUrl)
    return false
  })
  return candidates[0]
}

export function layoutEffectLabel(layout: string): string {
  if (layout === 'split_screen') return 'Split screen — side by side'
  if (layout === 'picture_in_picture') return 'Picture-in-picture'
  return 'Layout'
}
