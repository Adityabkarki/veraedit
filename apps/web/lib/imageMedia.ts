/**
 * Image overlay layers — Canva-style elements on top of the video (not B-Roll).
 */

import type { Clip } from '@/stores/timelineStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { useUIStore } from '@/stores/uiStore'
import {
  allocateDedicatedTrack,
  IMAGES_FAMILY,
} from '@/lib/timelineLayers'
import { dismissClipEditorPanel } from '@/lib/clipEditorDismiss'

const IMAGE_DEFAULTS: Record<
  string,
  { visualType: string; widthPct: number; heightPct: number; duration: number; label: string }
> = {
  image_photo: {
    visualType: 'image_slot',
    widthPct: 40,
    heightPct: 40,
    duration: 4,
    label: 'Photo',
  },
  image_sticker: {
    visualType: 'image_sticker',
    widthPct: 22,
    heightPct: 22,
    duration: 3,
    label: 'Sticker',
  },
  image_shape: {
    visualType: 'image_shape',
    widthPct: 28,
    heightPct: 18,
    duration: 3,
    label: 'Shape',
  },
}

export function insertImageAt(
  toolId: string,
  toolName: string,
  startTime: number,
): string | null {
  const spec = IMAGE_DEFAULTS[toolId] ?? IMAGE_DEFAULTS.image_photo
  const duration = spec.duration
  const { tracks, clips } = useTimelineStore.getState()
  const { tracks: nextTracks, trackId } = allocateDedicatedTrack(
    tracks,
    clips,
    IMAGES_FAMILY,
  )

  const id = `img-${Date.now().toString(36)}`
  const clip: Clip = {
    id,
    trackId,
    startTime,
    duration,
    label: spec.label,
    type: 'overlay',
    effects: {
      visualType: spec.visualType,
      overlayMode: 'corner',
      widthPct: spec.widthPct,
      heightPct: spec.heightPct,
      xPct: 50,
      yPct: 50,
      isPlaceholder: true,
      displayValue: '',
      styleToolId: toolId,
      mediaKind: 'image',
    },
  }

  useTimelineStore.setState({
    tracks: nextTracks,
    clips: [...clips, clip],
    lastEditAction: `Added ${toolName} overlay`,
    selectedClipIds: [id],
  })
  openImageEditor(id)
  return id
}

export function openImageEditor(clipId: string): void {
  useTimelineStore.getState().selectClip(clipId)
  useUIStore.getState().setRightPanelMode('image')
  if (!useUIStore.getState().aiPanelOpen) {
    useUIStore.setState({ aiPanelOpen: true })
  }
}

/** Dismiss image upload UI — right panel + timeline selection. */
export function closeImageEditor(): void {
  dismissClipEditorPanel()
}

export function attachFileToImageClip(clipId: string, file: File): void {
  const objectUrl = URL.createObjectURL(file)
  useTimelineStore.getState().updateOverlayClip(clipId, {
    mediaUrl: objectUrl,
    mediaKind: 'image',
    isPlaceholder: false,
    displayValue: '',
    mediaFileName: file.name,
    label: file.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Image',
  })
  useTimelineStore.setState({ lastEditAction: `Added image: ${file.name}` })
}

export function attachUrlToImageClip(clipId: string, rawUrl: string): boolean {
  const url = rawUrl.trim()
  if (!url || !/^https?:\/\//i.test(url)) return false
  if (/\.(mp4|webm|mov|m4v|avi)(\?.*)?$/i.test(url)) return false
  useTimelineStore.getState().updateOverlayClip(clipId, {
    mediaUrl: url,
    mediaKind: 'image',
    isPlaceholder: false,
    displayValue: '',
    mediaFileName: url.split('/').pop()?.slice(0, 48) ?? 'Linked image',
  })
  useTimelineStore.setState({ lastEditAction: 'Linked image from URL' })
  return true
}

export function clearImageMedia(clipId: string): void {
  useTimelineStore.getState().updateOverlayClip(clipId, {
    mediaUrl: undefined,
    mediaKind: 'image',
    isPlaceholder: true,
    mediaFileName: undefined,
    backgroundRemoved: false,
  })
  useTimelineStore.setState({ lastEditAction: 'Removed image media' })
}

/**
 * Run in-browser background removal and swap the clip to a transparent PNG.
 */
export async function removeBackgroundFromImageClip(
  clipId: string,
  onProgress?: (progress: import('@/lib/backgroundRemoval').BackgroundRemovalProgress) => void,
): Promise<void> {
  const { clips } = useTimelineStore.getState()
  const clip = clips.find((c) => c.id === clipId)
  const src = clip?.effects?.mediaUrl
  if (!clip || !src) {
    throw new Error('Add an image before removing the background.')
  }

  const { removeImageBackground } = await import('@/lib/backgroundRemoval')
  const oldUrl = src
  const blob = await removeImageBackground(src, onProgress)
  const newUrl = URL.createObjectURL(blob)

  if (oldUrl.startsWith('blob:')) {
    URL.revokeObjectURL(oldUrl)
  }

  const baseName =
    clip.effects?.mediaFileName?.replace(/\.[^.]+$/, '') ??
    clip.label.replace(/\s+/g, '-').slice(0, 24) ??
    'Image'

  useTimelineStore.getState().updateOverlayClip(clipId, {
    mediaUrl: newUrl,
    mediaKind: 'image',
    isPlaceholder: false,
    backgroundRemoved: true,
    mediaFileName: `${baseName}-nobg.png`,
  })
  useTimelineStore.setState({ lastEditAction: 'Removed image background' })
}
