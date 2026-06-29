/**
 * Image layer store — facade over timeline clips for the properties panel.
 *
 * Image data lives on timeline overlay clips; this store exposes the
 * ImageLayer API without duplicating state.
 */

import { create } from 'zustand'
import type {
  ImageAnimation,
  ImageAppearance,
  ImageBorder,
  ImageLayer,
  ImageTiming,
  ImageTransform,
} from '@/types/editor'
import {
  bringImageLayerForward,
  clipToImageLayer,
  duplicateImageLayer,
  removeImageLayer,
  selectImageLayer,
  selectedImageLayer,
  sendImageLayerBackward,
  updateImageAnimation,
  updateImageAppearance,
  updateImageBorder,
  updateImageLayer,
  updateImageTiming,
  updateImageTransform,
} from '@/lib/imageLayer'
import { useTimelineStore } from '@/stores/timelineStore'
import { isImageClip } from '@/lib/mediaClips'

interface ImageLayerStore {
  selectLayer: (id: string | null) => void
  updateLayer: (id: string, patch: Partial<ImageLayer>) => void
  updateTransform: (id: string, patch: Partial<ImageTransform>) => void
  updateTiming: (id: string, patch: Partial<ImageTiming>) => void
  updateAppearance: (id: string, patch: Partial<ImageAppearance>) => void
  updateBorder: (id: string, patch: Partial<ImageBorder>) => void
  updateAnimation: (id: string, patch: Partial<ImageAnimation>) => void
  duplicateLayer: (id: string) => void
  removeLayer: (id: string) => void
  bringForward: (id: string) => void
  sendBackward: (id: string) => void
  selectedLayer: () => ImageLayer | null
  layerById: (id: string) => ImageLayer | null
}

export const useImageLayerStore = create<ImageLayerStore>(() => ({
  selectLayer: selectImageLayer,
  updateLayer: updateImageLayer,
  updateTransform: updateImageTransform,
  updateTiming: updateImageTiming,
  updateAppearance: updateImageAppearance,
  updateBorder: updateImageBorder,
  updateAnimation: updateImageAnimation,
  duplicateLayer: duplicateImageLayer,
  removeLayer: removeImageLayer,
  bringForward: bringImageLayerForward,
  sendBackward: sendImageLayerBackward,
  selectedLayer: selectedImageLayer,
  layerById: (id) => {
    const clip = useTimelineStore.getState().clips.find((c) => c.id === id)
    if (!clip || !isImageClip(clip)) return null
    return clipToImageLayer(clip)
  },
}))

/** React hook — re-renders when the clip backing this layer changes. */
export function useImageLayer(layerId: string): ImageLayer | null {
  const clip = useTimelineStore((s) => s.clips.find((c) => c.id === layerId))
  if (!clip || !isImageClip(clip)) return null
  return clipToImageLayer(clip)
}

export function useSelectedImageLayer(): ImageLayer | null {
  const clip = useTimelineStore((s) => {
    if (s.selectedClipIds.length !== 1) return null
    const c = s.clips.find((x) => x.id === s.selectedClipIds[0])
    return c && isImageClip(c) ? c : null
  })
  if (!clip) return null
  return clipToImageLayer(clip)
}
