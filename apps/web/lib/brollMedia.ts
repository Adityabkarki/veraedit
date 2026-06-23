/**
 * Attach image/video media to B-Roll timeline clips.
 */

import type { Clip } from '@/stores/timelineStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { isBrollClip } from '@/lib/mediaClips'
import { useUIStore } from '@/stores/uiStore'

export type BrollMediaKind = 'image' | 'video'

export function isLikelyImageUrl(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url.trim())
}

export function mediaKindFromFile(file: File): BrollMediaKind {
  return file.type.startsWith('image/') ? 'image' : 'video'
}

export function mediaKindFromUrl(url: string): BrollMediaKind {
  return isLikelyImageUrl(url) ? 'image' : 'video'
}

export function activeBrollClipAt(clips: Clip[], time: number): Clip | undefined {
  return clips.find(
    (c) =>
      isBrollClip(c) &&
      time >= c.startTime - 0.001 &&
      time < c.startTime + c.duration + 0.001,
  )
}

export function attachFileToBrollClip(clipId: string, file: File): void {
  const objectUrl = URL.createObjectURL(file)
  useTimelineStore.getState().updateOverlayClip(clipId, {
    mediaUrl: objectUrl,
    mediaKind: mediaKindFromFile(file),
    isPlaceholder: false,
    displayValue: '',
    mediaFileName: file.name,
  })
  useTimelineStore.setState({ lastEditAction: `Added B-Roll: ${file.name}` })
}

export function attachUrlToBrollClip(clipId: string, rawUrl: string): boolean {
  const url = rawUrl.trim()
  if (!url || !/^https?:\/\//i.test(url)) return false
  useTimelineStore.getState().updateOverlayClip(clipId, {
    mediaUrl: url,
    mediaKind: mediaKindFromUrl(url),
    isPlaceholder: false,
    displayValue: '',
    mediaFileName: url.split('/').pop()?.slice(0, 48) ?? 'Linked media',
  })
  useTimelineStore.setState({ lastEditAction: 'Linked B-Roll from URL' })
  return true
}

export function clearBrollMedia(clipId: string): void {
  useTimelineStore.getState().updateOverlayClip(clipId, {
    mediaUrl: undefined,
    mediaKind: undefined,
    isPlaceholder: true,
    displayValue: '',
    mediaFileName: undefined,
  })
  useTimelineStore.setState({ lastEditAction: 'Removed B-Roll media' })
}

/** Select clip and open the B-Roll editor in the right panel. */
export function openBrollEditor(clipId: string): void {
  useTimelineStore.getState().selectClip(clipId)
  useUIStore.getState().setRightPanelMode('broll')
  if (!useUIStore.getState().aiPanelOpen) {
    useUIStore.setState({ aiPanelOpen: true })
  }
}
