/**
 * Insert style-transfer toolbox tools onto the timeline at the playhead.
 * Each tool maps to overlay, effects, or video transform clips.
 */

import type { Clip, Track } from '@/stores/timelineStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { defaultKeyframes } from '@/lib/effectKeyframes'
import { applyEffectToTimeline, applyTransitionToTimeline } from '@/lib/applyEffects'
import {
  insertBrollAt,
  insertSfxAt,
  isBrollToolId,
  isSfxToolId,
  isImageToolId,
} from '@/lib/mediaClips'
import { insertImageAt } from '@/lib/imageMedia'
import { allocateDedicatedTrack, OVERLAY_FAMILY, offsetEffectsForLane } from '@/lib/timelineLayers'
import { layoutEffectLabel } from '@/lib/videoLayout'
import { MOTION_GRAPHIC_DEFAULTS } from '@/lib/motionGraphics'
import { defaultEntranceForVisualType } from '@/lib/overlayAnimations'
import { insertCaptionEffectAt, isCaptionEffectToolId } from '@/lib/captionEffects'
import {
  CAMERA_TRACK_ID,
  cameraZoomDuration,
  cameraZoomLabel,
  openCameraZoomEditor,
  scrollTimelineToClip,
  zoomEasingForTool,
} from '@/lib/cameraZoom'

export interface StyleToolPayload {
  type: 'style-tool'
  toolId: string
  toolName: string
  category: string
}

/** Map toolbox tool IDs → timeline clip configuration. */
const TOOL_CLIP_MAP: Record<
  string,
  { trackId: string; duration: number; clipType: Clip['type']; effects: Record<string, unknown> }
> = {
  shot_aroll_host: {
    trackId: 'video',
    duration: 1.5,
    clipType: 'video',
    effects: { shot_type: 'aroll_host', framing: 'mcu', scale: 1.0 },
  },
  shot_aroll_guest: {
    trackId: 'video',
    duration: 1.5,
    clipType: 'video',
    effects: { shot_type: 'aroll_guest', framing: 'mcu', scale: 1.05 },
  },
  shot_motion_graphic: {
    trackId: 'overlay',
    duration: 3,
    clipType: 'overlay',
    effects: { visualType: 'animated_graphic', shot_type: 'motion_graphic' },
  },
  framing_mcu: {
    trackId: CAMERA_TRACK_ID,
    duration: 2,
    clipType: 'effect',
    effects: { effectType: 'digital_zoom', framing: 'mcu', scale_end: 1.08 },
  },
  framing_ecu: {
    trackId: CAMERA_TRACK_ID,
    duration: 1.5,
    clipType: 'effect',
    effects: { effectType: 'digital_zoom', framing: 'ecu', scale_end: 1.2 },
  },
  zoom_step_108: {
    trackId: CAMERA_TRACK_ID,
    duration: 1.2,
    clipType: 'effect',
    effects: { effectType: 'digital_zoom', scale_end: 1.08 },
  },
  zoom_step_115: {
    trackId: CAMERA_TRACK_ID,
    duration: 1.2,
    clipType: 'effect',
    effects: { effectType: 'digital_zoom', scale_end: 1.15 },
  },
  zoom_continuous_push: {
    trackId: CAMERA_TRACK_ID,
    duration: 3,
    clipType: 'effect',
    effects: { effectType: 'digital_zoom', zoom_mode: 'continuous_push', scale_end: 1.06 },
  },
  digital_zoom_punch: {
    trackId: CAMERA_TRACK_ID,
    duration: 0.8,
    clipType: 'effect',
    effects: { effectType: 'digital_zoom', scale_end: 1.12 },
  },
  vfx_vignette: {
    trackId: 'effects',
    duration: 4,
    clipType: 'effect',
    effects: { effectType: 'filter', vfx: 'vignette', vignette_amount: 0.05 },
  },
  vfx_edge_blur: {
    trackId: 'effects',
    duration: 2,
    clipType: 'effect',
    effects: { effectType: 'filter', vfx: 'edge_blur' },
  },
  vfx_camera_shake: {
    trackId: 'effects',
    duration: 0.15,
    clipType: 'effect',
    effects: { effectType: 'transform', vfx: 'camera_shake' },
  },
  motion_data_card: {
    trackId: 'overlay',
    duration: 2.5,
    clipType: 'overlay',
    effects: {
      visualType: 'data_card',
      ...MOTION_GRAPHIC_DEFAULTS.data_card,
      overlayEntrance: 'slide_in_up',
      overlayExit: 'fade_out',
    },
  },
  motion_arrow_flow: {
    trackId: 'overlay',
    duration: 2,
    clipType: 'overlay',
    effects: {
      visualType: 'arrow_flow',
      ...MOTION_GRAPHIC_DEFAULTS.arrow_flow,
      overlayEntrance: 'slide_in_right',
      overlayExit: 'none',
    },
  },
  motion_conflict_box: {
    trackId: 'overlay',
    duration: 2,
    clipType: 'overlay',
    effects: {
      visualType: 'conflict_box',
      ...MOTION_GRAPHIC_DEFAULTS.conflict_box,
      overlayEntrance: 'fade_in',
      overlayExit: 'fade_out',
    },
  },
  image_photo: {
    trackId: 'images',
    duration: 4,
    clipType: 'overlay',
    effects: {
      visualType: 'image_slot',
      overlayMode: 'corner',
      widthPct: 55,
      heightPct: 55,
      xPct: 50,
      yPct: 50,
      mediaKind: 'image',
      isPlaceholder: true,
    },
  },
  image_sticker: {
    trackId: 'images',
    duration: 3,
    clipType: 'overlay',
    effects: {
      visualType: 'image_sticker',
      widthPct: 22,
      heightPct: 22,
      xPct: 50,
      yPct: 50,
      mediaKind: 'image',
      isPlaceholder: true,
    },
  },
  image_shape: {
    trackId: 'images',
    duration: 3,
    clipType: 'overlay',
    effects: {
      visualType: 'image_shape',
      widthPct: 28,
      heightPct: 18,
      xPct: 50,
      yPct: 40,
      mediaKind: 'image',
      isPlaceholder: true,
      displayValue: '#3B82F6',
    },
  },
  overlay_upper_third_label: {
    trackId: 'overlay',
    duration: 3,
    clipType: 'overlay',
    effects: { visualType: 'upper_third_label', ...MOTION_GRAPHIC_DEFAULTS.upper_third_label },
  },
  retention_open_loop: {
    trackId: 'effects',
    duration: 0.5,
    clipType: 'effect',
    effects: { retention: 'open_loop', displayValue: 'HOW?' },
  },
  color_grade: {
    trackId: 'effects',
    duration: 30,
    clipType: 'effect',
    effects: { effectType: 'filter', contrast: 0.14, exposure: -0.2, clarity: 0.18 },
  },
  ken_burns: {
    trackId: CAMERA_TRACK_ID,
    duration: 4,
    clipType: 'effect',
    effects: { effectType: 'transform', effectPresetId: 'ken_burns', scale_end: 1.1, zoom_mode: 'continuous_push' },
  },
  title_hook_banner: {
    trackId: 'overlay',
    duration: 3,
    clipType: 'overlay',
    effects: { visualType: 'title_banner', displayValue: 'YOUR HOOK', xPct: 50, yPct: 14 },
  },
  hook_text_overlay: {
    trackId: 'overlay',
    duration: 3,
    clipType: 'overlay',
    effects: { visualType: 'hook_rewrite', displayValue: 'Opening hook', xPct: 50, yPct: 72 },
  },
  cta_overlay: {
    trackId: 'overlay',
    duration: 3,
    clipType: 'overlay',
    effects: { visualType: 'cta', displayValue: 'Subscribe for more', xPct: 50, yPct: 85 },
  },
  text_overlay: {
    trackId: 'overlay',
    duration: 2.5,
    clipType: 'overlay',
    effects: { visualType: 'statistic', displayValue: 'Callout text', xPct: 50, yPct: 50 },
  },
  lower_third: {
    trackId: 'overlay',
    duration: 3,
    clipType: 'overlay',
    effects: { visualType: 'key_term', displayValue: 'Name · Topic', xPct: 50, yPct: 88 },
  },
  logo_overlay: {
    trackId: 'overlay',
    duration: 30,
    clipType: 'overlay',
    effects: { visualType: 'statistic', displayValue: 'LOGO', xPct: 92, yPct: 8, widthPct: 12, heightPct: 12 },
  },
  emoji_reaction: {
    trackId: 'overlay',
    duration: 2,
    clipType: 'overlay',
    effects: { visualType: 'emoji_element', emoji: '🔥', xPct: 80, yPct: 25 },
  },
  split_screen: {
    trackId: 'effects',
    duration: 6,
    clipType: 'effect',
    effects: { effectType: 'layout', layout: 'split_screen' },
  },
  picture_in_picture: {
    trackId: 'effects',
    duration: 6,
    clipType: 'effect',
    effects: { effectType: 'layout', layout: 'picture_in_picture', pipScale: 0.28 },
  },
}

/** Style toolbox transition tools → Effects drawer transition ids (real clip transitions). */
export const TOOLBOX_TRANSITION_MAP: Record<string, string> = {
  hard_cut: 'cut',
  fade_transition: 'fade-black',
  dissolve_transition: 'dissolve',
  zoom_transition: 'zoom-in',
  whip_pan: 'whip-pan',
  vfx_frame_flash: 'fade-white',
}

function ensureTrack(tracks: Track[], trackId: string, label: string, color: string): Track[] {
  if (tracks.some((t) => t.id === trackId)) return tracks
  return [
    ...tracks,
    { id: trackId, label, color, muted: false, locked: false, visible: true },
  ]
}

function insertMusicBed(startTime: number): string | null {
  const duration = 30
  const id = `music-${Date.now().toString(36)}`
  const { tracks, clips } = useTimelineStore.getState()
  const clip: Clip = {
    id,
    trackId: 'music',
    startTime,
    duration,
    label: 'Background music',
    type: 'music',
    effects: {
      musicBed: true,
      isPlaceholder: true,
      styleTransfer: true,
    },
  }
  useTimelineStore.setState({
    tracks: ensureTrack(tracks, 'music', 'Music', '#10B981'),
    clips: [...clips, clip],
    lastEditAction: 'Added background music slot',
    selectedClipIds: [id],
  })
  return id
}

function insertJumpCutAt(startTime: number): string | null {
  const { clips } = useTimelineStore.getState()
  const video = clips.find(
    (c) =>
      c.trackId === 'video' &&
      startTime > c.startTime + 0.1 &&
      startTime < c.startTime + c.duration - 0.1,
  )
  if (!video) {
    useTimelineStore.setState({
      lastEditAction: 'Move the playhead onto a video clip to add a jump cut',
    })
    return null
  }
  useTimelineStore.getState().splitClip(video.id, startTime)
  useTimelineStore.setState({ lastEditAction: 'Jump cut at playhead' })
  return video.id
}

/** Insert a style toolbox tool at playhead time. Returns new clip id or null. */
export function insertStyleToolAt(toolId: string, toolName: string, startTime: number): string | null {
  if (isSfxToolId(toolId)) {
    return insertSfxAt(toolId, startTime)
  }
  if (isBrollToolId(toolId)) {
    return insertBrollAt(toolId, toolName, startTime)
  }
  if (isImageToolId(toolId)) {
    return insertImageAt(toolId, toolName, startTime)
  }
  if (toolId === 'music_bed') {
    return insertMusicBed(startTime)
  }
  if (toolId === 'jump_cut_pacing') {
    return insertJumpCutAt(startTime)
  }
  if (isCaptionEffectToolId(toolId)) {
    return insertCaptionEffectAt(toolId, toolName, startTime)
  }
  if (toolId === 'speed_ramp') {
    const result = applyEffectToTimeline('ramp', 'speed')
    useTimelineStore.setState({ lastEditAction: result.message })
    if (!result.ok) return null
    const added = useTimelineStore
      .getState()
      .clips.find((c) => c.trackId === 'effects' && c.effects?.effectPresetId === 'ramp')
    return added?.id ?? null
  }

  const transitionId = TOOLBOX_TRANSITION_MAP[toolId]
  if (transitionId) {
    const result = applyTransitionToTimeline(transitionId, startTime)
    useTimelineStore.setState({ lastEditAction: result.message })
    if (!result.ok) return null
    const { clips } = useTimelineStore.getState()
    const video = clips.find(
      (c) =>
        c.trackId === 'video' &&
        startTime >= c.startTime - 0.01 &&
        startTime <= c.startTime + c.duration + 0.35,
    )
    return video?.id ?? null
  }

  const spec = TOOL_CLIP_MAP[toolId] ?? {
    trackId: 'overlay',
    duration: 2,
    clipType: 'overlay' as const,
    effects: { visualType: 'statistic', styleToolId: toolId },
  }

  const id = `st-${Date.now().toString(36)}`
  const scaleEnd = Number((spec.effects as { scale_end?: number }).scale_end ?? 1)
  const presetId = (spec.effects as { effectPresetId?: string }).effectPresetId
  const isZoomTool =
    toolId.includes('zoom') ||
    toolId === 'ken_burns' ||
    presetId === 'ken_burns' ||
    (spec.effects as { effectType?: string }).effectType === 'digital_zoom'

  const { clips: existingClips } = useTimelineStore.getState()
  const parentVideo = existingClips.find(
    (c) =>
      c.trackId === 'video' &&
      startTime >= c.startTime &&
      startTime < c.startTime + c.duration,
  )

  const effects: Clip['effects'] = {
    ...spec.effects,
    styleToolId: toolId,
  }
  if (spec.clipType === 'overlay' && !effects.overlayEntrance) {
    effects.overlayEntrance = defaultEntranceForVisualType(
      String(effects.visualType ?? ''),
    )
  }
  const clipDuration = isZoomTool
    ? cameraZoomDuration(toolId, spec.duration, startTime, parentVideo)
    : spec.duration

  if ((spec.trackId === 'effects' || spec.trackId === CAMERA_TRACK_ID) && spec.clipType === 'effect') {
    if (isZoomTool) {
      effects.effectType = 'transform'
      effects.effectPresetId = presetId ?? 'digital_zoom_punch'
      if (parentVideo) effects.parentClipId = parentVideo.id
      effects.zoomEasing = zoomEasingForTool(toolId)
      effects.keyframes = [
        { offset: 0, value: 1 },
        { offset: 1, value: scaleEnd },
      ]
    } else {
      effects.keyframes = defaultKeyframes(clipDuration, 1, scaleEnd)
    }
  }

  const clip: Clip = {
    id,
    trackId: spec.trackId,
    startTime,
    duration: clipDuration,
    label: isZoomTool ? cameraZoomLabel({ id, trackId: spec.trackId, startTime, duration: clipDuration, label: toolName, type: spec.clipType, effects }) : toolName,
    type: spec.clipType,
    effects,
  }

  const { tracks, clips } = useTimelineStore.getState()
  let nextTracks = tracks
  let trackId = spec.trackId

  if (spec.trackId === 'overlay') {
    const alloc = allocateDedicatedTrack(tracks, clips, OVERLAY_FAMILY)
    nextTracks = alloc.tracks
    trackId = alloc.trackId
    clip.trackId = trackId
    clip.effects = offsetEffectsForLane(
      clip.effects ?? {},
      trackId,
      OVERLAY_FAMILY.prefix,
    ) as Clip['effects']
  } else if (spec.trackId === 'effects') {
    nextTracks = ensureTrack(nextTracks, 'effects', 'Effects', '#7C3AED')
    const layout = (spec.effects as { layout?: string }).layout
    if (layout) {
      clip.label = layoutEffectLabel(layout)
    }
  } else if (spec.trackId === CAMERA_TRACK_ID) {
    nextTracks = ensureTrack(nextTracks, CAMERA_TRACK_ID, 'Camera', '#2563EB')
  }

  useTimelineStore.setState({
    tracks: nextTracks,
    clips: [...clips, clip],
    lastEditAction: isZoomTool
      ? `Added ${cameraZoomLabel(clip)} on Camera track — scrub playhead through the clip to preview`
      : (spec.effects as { layout?: string }).layout
        ? `${layoutEffectLabel(String((spec.effects as { layout?: string }).layout))} — add B-roll for the second panel, then scrub the playhead to preview`
        : `Added ${toolName}`,
    selectedClipIds: [id],
  })
  if (isZoomTool) {
    openCameraZoomEditor(id)
    scrollTimelineToClip(clip)
  }
  return id
}

export function parseStyleToolDrag(data: string): StyleToolPayload | null {
  try {
    const parsed = JSON.parse(data) as StyleToolPayload
    if (parsed?.type === 'style-tool' && parsed.toolId) return parsed
  } catch {
    return null
  }
  return null
}
