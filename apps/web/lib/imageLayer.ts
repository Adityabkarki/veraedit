/**
 * Bridge between timeline image clips and the ImageLayer properties model.
 */

import type { Clip, ClipEffects } from '@/stores/timelineStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { commitTimelineClips, getFullTimelineClips } from '@/lib/editor/timelineClipUpdates'
import { isImageClip } from '@/lib/mediaClips'
import { overlayPreviewZIndex } from '@/lib/overlayPreview'
import type {
  AnimationEffect,
  BlendMode,
  CropAspect,
  ExitEffect,
  FilterPreset,
  ImageAnimation,
  ImageAppearance,
  ImageBorder,
  ImageLayer,
  ImageTiming,
  ImageTransform,
  MaskShape,
} from '@/types/editor'

const ENTRANCE_TO_OVERLAY: Record<AnimationEffect, string> = {
  none: 'none',
  fade_in: 'fade_in',
  slide_up: 'slide_in_up',
  slide_left: 'slide_in_left',
  zoom_in: 'fade_in',
  bounce: 'fade_in',
  ken_burns: 'none',
}

const OVERLAY_TO_ENTRANCE: Record<string, AnimationEffect> = {
  none: 'none',
  fade_in: 'fade_in',
  slide_in_up: 'slide_up',
  slide_in_left: 'slide_left',
  slide_in_right: 'slide_left',
  slide_in_down: 'slide_up',
}

const EXIT_TO_OVERLAY: Record<ExitEffect, string> = {
  none: 'none',
  fade_out: 'fade_out',
  slide_down: 'slide_out_down',
  zoom_out: 'fade_out',
}

const OVERLAY_TO_EXIT: Record<string, ExitEffect> = {
  none: 'none',
  fade_out: 'fade_out',
  slide_out_down: 'slide_down',
  slide_out_up: 'slide_down',
  slide_out_left: 'fade_out',
  slide_out_right: 'fade_out',
}

function asBlendMode(v?: string): BlendMode {
  const modes: BlendMode[] = [
    'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
    'color-burn', 'color-dodge', 'soft-light',
  ]
  return modes.includes(v as BlendMode) ? (v as BlendMode) : 'normal'
}

function asFilterPreset(v?: string): FilterPreset {
  const presets: FilterPreset[] = [
    'none', 'cinematic_warm', 'cinematic_cold', 'vintage_film',
    'corporate_clean', 'dark_moody', 'bright_airy', 'bw',
  ]
  return presets.includes(v as FilterPreset) ? (v as FilterPreset) : 'none'
}

function asCropAspect(v?: string): CropAspect {
  const aspects: CropAspect[] = ['free', '1:1', '16:9', '9:16', '4:5']
  return aspects.includes(v as CropAspect) ? (v as CropAspect) : 'free'
}

function asMaskShape(v?: string): MaskShape {
  const shapes: MaskShape[] = ['none', 'rect', 'circle', 'star', 'custom']
  return shapes.includes(v as MaskShape) ? (v as MaskShape) : 'none'
}

export function clipToImageLayer(clip: Clip): ImageLayer {
  const e = clip.effects ?? {}
  const entrance = OVERLAY_TO_ENTRANCE[e.overlayEntrance ?? 'none'] ?? 'none'
  const exit = OVERLAY_TO_EXIT[e.overlayExit ?? 'none'] ?? 'none'

  return {
    id: clip.id,
    type: 'image',
    src: e.mediaUrl ?? '',
    storageKey: e.storageKey ?? '',
    name: clip.label,
    transform: {
      x: e.xPct ?? 50,
      y: e.yPct ?? 50,
      width: e.widthPct ?? 40,
      height: e.heightPct ?? 40,
      rotation: e.rotation ?? 0,
      scale: Math.round((e.scale ?? 1) * 100),
      flipX: e.flipX ?? false,
      flipY: e.flipY ?? false,
      lockAspectRatio: e.lockAspectRatio ?? true,
    },
    timing: {
      startTime: clip.startTime,
      endTime: clip.startTime + clip.duration,
      layer: e.layerOrder ?? overlayPreviewZIndex(clip),
    },
    appearance: {
      opacity: e.imageOpacity ?? 100,
      brightness: e.brightness ?? 100,
      contrast: e.contrast ?? 100,
      saturation: e.saturation ?? 100,
      sharpness: e.sharpness ?? 0,
      blur: e.blurPx ?? 0,
      cornerRadius: e.cornerRadius ?? 0,
    },
    blendMode: asBlendMode(e.blendMode),
    filter: asFilterPreset(e.filterPreset),
    filterIntensity: e.filterIntensity ?? 100,
    border: {
      width: e.borderWidth ?? 0,
      color: e.borderColor ?? '#ffffff',
      shadowEnabled: e.shadowEnabled ?? false,
      shadowBlur: e.shadowBlur ?? 10,
      shadowOffsetX: e.shadowOffsetX ?? 5,
      shadowOffsetY: e.shadowOffsetY ?? 5,
      shadowColor: e.shadowColor ?? '#000000',
      shadowOpacity: e.shadowOpacity ?? 50,
    },
    animation: {
      entrance,
      entranceDuration: e.entranceDuration ?? 0.5,
      exit,
      exitDuration: e.exitDuration ?? 0.5,
    },
    cropAspect: asCropAspect(e.cropAspect),
    maskShape: asMaskShape(e.maskShape),
    locked: e.imageLocked ?? false,
    visible: e.imageVisible ?? true,
  }
}

export function selectedImageLayer(): ImageLayer | null {
  const { selectedClipIds } = useTimelineStore.getState()
  const clips = getFullTimelineClips()
  if (selectedClipIds.length !== 1) return null
  const clip = clips.find((c) => c.id === selectedClipIds[0])
  if (!clip || !isImageClip(clip)) return null
  return clipToImageLayer(clip)
}

function patchEffects(clipId: string, patch: Partial<ClipEffects>, label?: string) {
  useTimelineStore.getState().updateOverlayClip(clipId, patch)
  if (label) {
    useTimelineStore.setState({ lastEditAction: label })
  }
}

export function updateImageLayer(clipId: string, patch: Partial<ImageLayer>) {
  const effects: Partial<ClipEffects> = {}
  if (patch.name !== undefined) {
    commitTimelineClips((allClips) =>
      allClips.map((c) => (c.id === clipId ? { ...c, label: patch.name! } : c)),
    )
  }
  if (patch.src !== undefined) effects.mediaUrl = patch.src
  if (patch.storageKey !== undefined) effects.storageKey = patch.storageKey
  if (patch.blendMode !== undefined) effects.blendMode = patch.blendMode
  if (patch.filter !== undefined) effects.filterPreset = patch.filter
  if (patch.filterIntensity !== undefined) effects.filterIntensity = patch.filterIntensity
  if (patch.cropAspect !== undefined) effects.cropAspect = patch.cropAspect
  if (patch.maskShape !== undefined) effects.maskShape = patch.maskShape
  if (patch.locked !== undefined) effects.imageLocked = patch.locked
  if (patch.visible !== undefined) effects.imageVisible = patch.visible
  if (Object.keys(effects).length > 0) patchEffects(clipId, effects)
}

export function updateImageTransform(clipId: string, patch: Partial<ImageTransform>) {
  const effects: Partial<ClipEffects> = {}
  if (patch.x !== undefined) effects.xPct = patch.x
  if (patch.y !== undefined) effects.yPct = patch.y
  if (patch.width !== undefined) effects.widthPct = patch.width
  if (patch.height !== undefined) effects.heightPct = patch.height
  if (patch.rotation !== undefined) effects.rotation = patch.rotation
  if (patch.scale !== undefined) effects.scale = patch.scale / 100
  if (patch.flipX !== undefined) effects.flipX = patch.flipX
  if (patch.flipY !== undefined) effects.flipY = patch.flipY
  if (patch.lockAspectRatio !== undefined) effects.lockAspectRatio = patch.lockAspectRatio
  patchEffects(clipId, effects, 'Updated image transform')
}

export function updateImageTiming(clipId: string, patch: Partial<ImageTiming>) {
  const store = useTimelineStore.getState()
  const clip = getFullTimelineClips().find((c) => c.id === clipId)
  if (!clip) return

  if (patch.startTime !== undefined) {
    store.moveClip(clipId, Math.max(0, patch.startTime))
  }
  if (patch.endTime !== undefined) {
    const current = getFullTimelineClips().find((c) => c.id === clipId)
    if (current) {
      const duration = Math.max(0.1, patch.endTime - current.startTime)
      store.trimClipEnd(clipId, duration)
    }
  }
  if (patch.layer !== undefined) {
    patchEffects(clipId, { layerOrder: patch.layer }, 'Updated layer order')
  }
}

export function updateImageAppearance(clipId: string, patch: Partial<ImageAppearance>) {
  const effects: Partial<ClipEffects> = {}
  if (patch.opacity !== undefined) effects.imageOpacity = patch.opacity
  if (patch.brightness !== undefined) effects.brightness = patch.brightness
  if (patch.contrast !== undefined) effects.contrast = patch.contrast
  if (patch.saturation !== undefined) effects.saturation = patch.saturation
  if (patch.sharpness !== undefined) effects.sharpness = patch.sharpness
  if (patch.blur !== undefined) effects.blurPx = patch.blur
  if (patch.cornerRadius !== undefined) effects.cornerRadius = patch.cornerRadius
  patchEffects(clipId, effects, 'Updated image appearance')
}

export function updateImageBorder(clipId: string, patch: Partial<ImageBorder>) {
  const effects: Partial<ClipEffects> = {}
  if (patch.width !== undefined) effects.borderWidth = patch.width
  if (patch.color !== undefined) effects.borderColor = patch.color
  if (patch.shadowEnabled !== undefined) effects.shadowEnabled = patch.shadowEnabled
  if (patch.shadowBlur !== undefined) effects.shadowBlur = patch.shadowBlur
  if (patch.shadowOffsetX !== undefined) effects.shadowOffsetX = patch.shadowOffsetX
  if (patch.shadowOffsetY !== undefined) effects.shadowOffsetY = patch.shadowOffsetY
  if (patch.shadowColor !== undefined) effects.shadowColor = patch.shadowColor
  if (patch.shadowOpacity !== undefined) effects.shadowOpacity = patch.shadowOpacity
  patchEffects(clipId, effects, 'Updated border & shadow')
}

export function updateImageAnimation(clipId: string, patch: Partial<ImageAnimation>) {
  const effects: Partial<ClipEffects> = {}
  if (patch.entrance !== undefined) {
    effects.overlayEntrance = ENTRANCE_TO_OVERLAY[patch.entrance]
  }
  if (patch.exit !== undefined) {
    effects.overlayExit = EXIT_TO_OVERLAY[patch.exit]
  }
  if (patch.entranceDuration !== undefined) effects.entranceDuration = patch.entranceDuration
  if (patch.exitDuration !== undefined) effects.exitDuration = patch.exitDuration
  patchEffects(clipId, effects, 'Updated image animation')
}

export function duplicateImageLayer(clipId: string) {
  useTimelineStore.getState().duplicateClip(clipId)
}

export function removeImageLayer(clipId: string) {
  const store = useTimelineStore.getState()
  store.selectClip(clipId)
  store.deleteSelectedClips()
}

export function bringImageLayerForward(clipId: string) {
  const clip = getFullTimelineClips().find((c) => c.id === clipId)
  if (!clip) return
  const current = clip.effects?.layerOrder ?? overlayPreviewZIndex(clip)
  patchEffects(clipId, { layerOrder: current + 1 }, 'Brought image forward')
}

export function sendImageLayerBackward(clipId: string) {
  const clip = getFullTimelineClips().find((c) => c.id === clipId)
  if (!clip) return
  const current = clip.effects?.layerOrder ?? overlayPreviewZIndex(clip)
  patchEffects(clipId, { layerOrder: Math.max(0, current - 1) }, 'Sent image backward')
}

export function selectImageLayer(clipId: string | null) {
  if (!clipId) {
    useTimelineStore.getState().clearSelection()
    return
  }
  useTimelineStore.getState().selectClip(clipId)
}
