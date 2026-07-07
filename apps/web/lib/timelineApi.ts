/**
 * Timeline API mappers — convert between the frontend flat store model
 * (tracks[] + clips[] with trackId) and the backend nested JSON schema.
 */

import type { Clip, ClipEffects, Track } from '@/stores/timelineStore'
import { migrateCameraZoomClips } from '@/lib/cameraZoom'
import { colorGradeToCss, mapStyleTransitionType } from '@/lib/styleTransferSync'
import { migrateBrollClipsToTrack, migrateSfxClipsToLanes } from '@/lib/mediaClips'
import { migrateElementClipsToDedicatedLanes, syntheticTrack } from '@/lib/timelineLayers'
import { migrateCaptionEffectClips } from '@/lib/captionEffects'
import { resolveClipAssetId } from '@/lib/exportTimeline'

// ── Backend shapes (subset used by the editor) ────────────────────────────────

export interface ApiTimelineClip {
  id: string
  asset_id: string
  source_start: number
  source_end: number
  timeline_start: number
  timeline_end: number
  label?: string
  speed?: number
  muted?: boolean
  volume?: number
  effects?: { type: string; params?: Record<string, unknown> }[]
  transitions?: {
    in?: { type?: string; duration?: number }
    out?: { type?: string; duration?: number }
  }
  gap_resolution_needed?: boolean
  gap_metadata?: Record<string, unknown>
}

export interface ApiTimelineTrack {
  id: string
  type: 'video' | 'audio' | 'captions' | 'overlay' | 'music' | 'effects'
  name?: string
  muted?: boolean
  locked?: boolean
  visible?: boolean
  style?: Record<string, unknown>
  clips: ApiTimelineClip[]
}

export interface ApiTimelineData {
  schema_version: number
  tracks: ApiTimelineTrack[]
  global_settings: {
    resolution?: string
    fps?: number
    audio_sample_rate?: number
    duration: number
  }
  metadata?: Record<string, unknown>
}

export interface ApiTimelineResponse {
  id: string | null
  version: number
  label?: string
  data: ApiTimelineData
  can_undo?: boolean
  can_redo?: boolean
}

/** True when GET /timeline returned a row stored in the DB (not the synthetic empty default). */
export function isPersistedTimelineResponse(
  response: ApiTimelineResponse | null | undefined,
): boolean {
  return Boolean(response?.id)
}

const TYPE_TO_TRACK_ID: Record<string, string> = {
  video:    'video',
  audio:    'audio',
  captions: 'captions',
  music:    'music',
  overlay:  'overlay',
  effects:  'effects',
}

const TRACK_ID_TO_TYPE: Record<string, ApiTimelineTrack['type']> = {
  video:      'video',
  audio:      'audio',
  captions:   'captions',
  'caption-fx': 'effects',
  camera:     'effects',
  music:      'music',
  overlay:    'overlay',
  effects:    'effects',
}

const TRACK_COLORS: Record<string, string> = {
  video:      '#3B82F6',
  camera:     '#2563EB',
  audio:      '#8B5CF6',
  captions:   '#F59E0B',
  'caption-fx': '#D97706',
  music:      '#10B981',
  overlay:    '#EC4899',
  effects:    '#7C3AED',
}

const TRACK_LABELS: Record<string, string> = {
  video:      'Video',
  camera:     'Camera',
  broll:      'B-Roll',
  audio:      'Audio',
  captions:   'Captions',
  'caption-fx': 'Caption FX',
  music:      'Music',
  overlay:    'Elements',
  images:     'Image overlays',
  effects:    'Effects',
}

const DEFAULT_TRACKS: Track[] = [
  { id: 'video',    label: 'Video',    color: '#3B82F6', muted: false, locked: false, visible: true },
  { id: 'camera',   label: 'Camera',   color: '#2563EB', muted: false, locked: false, visible: true },
  { id: 'broll',    label: 'B-Roll',   color: '#374151', muted: false, locked: false, visible: true },
  { id: 'audio',    label: 'Audio',    color: '#8B5CF6', muted: false, locked: false, visible: true },
  { id: 'captions', label: 'Captions', color: '#F59E0B', muted: false, locked: false, visible: true },
  { id: 'caption-fx', label: 'Caption FX', color: '#D97706', muted: false, locked: false, visible: true },
  { id: 'overlay',  label: 'Elements', color: '#EC4899', muted: false, locked: false, visible: true },
  { id: 'effects',  label: 'Effects',  color: '#7C3AED', muted: false, locked: false, visible: true },
  { id: 'music',    label: 'Music',    color: '#10B981', muted: false, locked: false, visible: true },
]

function clipDuration(c: ApiTimelineClip): number {
  return Math.max(0.1, c.timeline_end - c.timeline_start)
}

function parseEffects(apiClip: ApiTimelineClip): ClipEffects | undefined {
  const result: ClipEffects = {}

  for (const fx of apiClip.effects ?? []) {
    if (fx.type === 'visual_overlay' && fx.params) {
      const p = fx.params
      result.visualType      = String(p.visual_type ?? result.visualType ?? '')
      result.templateId      = p.template_id ? String(p.template_id) : result.templateId
      result.displayValue    = String(p.display_value ?? result.displayValue ?? '')
      result.secondaryText   = String(p.secondary_text ?? result.secondaryText ?? '')
      result.suggestedVisual = String(p.suggested_visual ?? result.suggestedVisual ?? '')
      result.nepaliLabel     = String(p.nepali_label ?? result.nepaliLabel ?? '')
      if (p.x_pct != null) result.xPct = Number(p.x_pct)
      if (p.y_pct != null) result.yPct = Number(p.y_pct)
      if (p.scale != null) result.scale = Number(p.scale)
      if (p.style_transfer) result.styleTransfer = true
      if (p.overlay_mode) result.overlayMode = String(p.overlay_mode)
      if (p.width_pct != null) result.widthPct = Number(p.width_pct)
      if (p.broll_type) result.brollType = String(p.broll_type)
      if (p.is_placeholder != null) result.isPlaceholder = Boolean(p.is_placeholder)
      if (p.media_url) result.mediaUrl = String(p.media_url)
      if (p.media_kind) result.mediaKind = String(p.media_kind) as ClipEffects['mediaKind']
      if (p.storage_key) result.storageKey = String(p.storage_key)
      if (p.media_asset_id) result.mediaAssetId = String(p.media_asset_id)
      if (p.media_file_name) result.mediaFileName = String(p.media_file_name)
      if (p.height_pct != null) result.heightPct = Number(p.height_pct)
      if (p.overlay_entrance) result.overlayEntrance = String(p.overlay_entrance)
      if (p.overlay_exit) result.overlayExit = String(p.overlay_exit)
      if (p.motion_enter) result.motionEnter = String(p.motion_enter)
      if (p.motion_exit) result.motionExit = String(p.motion_exit)
      if (p.motion_enter_duration != null) result.motionEnterDuration = Number(p.motion_enter_duration)
      if (p.motion_exit_duration != null) result.motionExitDuration = Number(p.motion_exit_duration)
      if (p.motion_spring && typeof p.motion_spring === 'object') {
        result.motionSpring = p.motion_spring as ClipEffects['motionSpring']
      }
      if (p.motion_animation && typeof p.motion_animation === 'object') {
        result.motionAnimation = p.motion_animation as ClipEffects['motionAnimation']
      }
      if (p.motion_props && typeof p.motion_props === 'object') {
        result.motionProps = p.motion_props as Record<string, unknown>
      }
      if (p.brand_color) result.brandColor = String(p.brand_color)
      if (p.rotation != null) result.rotation = Number(p.rotation)
      if (p.chart_as_broll != null) result.chartAsBroll = Boolean(p.chart_as_broll)
    }
    if (fx.type === 'style_pacing') {
      result.styleTransfer = true
      result.pacingSegment = true
    }
    if (fx.type === 'sfx_slot' && fx.params) {
      result.sfxType = String(fx.params.sfx_type ?? 'whoosh')
      result.sfxSlug = fx.params.sfx_slug ? String(fx.params.sfx_slug) : undefined
      result.sfxVolume = Number(fx.params.volume ?? 0.35)
      result.styleTransfer = true
      result.isPlaceholder = fx.params.is_placeholder !== false
    }
    if (fx.type === 'music_bed' && fx.params) {
      result.musicBed = true
      result.styleTransfer = true
      result.displayValue = String(fx.params.slot_label ?? 'Add your background music')
      result.isPlaceholder = fx.params.is_placeholder !== false
      if (fx.params.duck_under_voice != null) {
        result.duckUnderVoice = Boolean(fx.params.duck_under_voice)
      }
      if (fx.params.storage_key) {
        result.musicStorageKey = String(fx.params.storage_key)
      }
    }
    if (fx.type === 'color_filter' && fx.params) {
      result.colorFilterId  = String(fx.params.filter_id ?? '')
      result.colorFilterCss = String(fx.params.css_filter ?? 'none')
    }
    if (fx.type === 'transition_out' && fx.params) {
      result.transitionOut      = String(fx.params.type ?? 'cut')
      result.transitionDuration = Number(fx.params.duration ?? 0)
    }
    if (fx.type === 'caption' && fx.params) {
      result.displayValue  = String(fx.params.text ?? result.displayValue ?? '')
      result.captionIndex  = fx.params.caption_index != null
        ? Number(fx.params.caption_index)
        : result.captionIndex
    }
    if (fx.type === 'keyframed_effect' && fx.params) {
      result.effectType     = String(fx.params.effect_type ?? 'filter') as ClipEffects['effectType']
      result.effectPresetId = String(fx.params.preset_id ?? '')
      result.parentClipId   = String(fx.params.parent_clip_id ?? '')
      result.colorFilterCss = fx.params.css_filter ? String(fx.params.css_filter) : result.colorFilterCss
      const raw = fx.params.keyframes
      if (Array.isArray(raw)) {
        result.keyframes = raw.map((k) => ({
          offset: Number((k as { offset?: number }).offset ?? 0),
          value:  Number((k as { value?: number }).value ?? 1),
        }))
      }
      if (fx.params.style_tool_id) result.styleToolId = String(fx.params.style_tool_id)
      if (fx.params.zoom_easing === 'ease-out' || fx.params.zoom_easing === 'linear') {
        result.zoomEasing = fx.params.zoom_easing
      }
      if (result.effectPresetId === 'digital_zoom_punch' || result.effectPresetId === 'ken_burns') {
        result.styleTransfer = true
      }
    }
    if (fx.type === 'color_grade' && fx.params) {
      result.colorFilterId = 'style-transfer'
      result.colorFilterCss = colorGradeToCss(fx.params)
      result.styleTransferColorGrade = fx.params
      result.styleTransfer = true
    }
    if (fx.type === 'caption_style') {
      result.effectType = 'caption'
      const params = (fx.params ?? {}) as Record<string, unknown>
      result.captionAnimation = String(params.animation ?? params.caption_animation ?? 'pop')
      if (params.max_words_per_line != null) {
        result.maxWordsPerLine = Number(params.max_words_per_line)
      }
      if (params.case) result.captionCase = String(params.case)
      if (params.position) result.captionPosition = String(params.position)
      result.styleTransfer = true
    }
    if (fx.type === 'audio_normalize') {
      result.styleTransfer = true
    }
  }

  return Object.keys(result).length > 0 ? result : undefined
}

function mergeClipTransitions(
  effects: ClipEffects | undefined,
  apiClip: ApiTimelineClip,
): ClipEffects | undefined {
  const out = apiClip.transitions?.out
  if (!out) return effects
  const merged: ClipEffects = { ...(effects ?? {}) }
  merged.transitionOut = mapStyleTransitionType(String(out.type ?? 'cut'))
  merged.transitionDuration = Number(out.duration ?? 0)
  merged.styleTransfer = true
  return merged
}

const SCOPED_LANE_ID = /^(overlay|images|broll|sfx)(-\d+)?$/

/** Map API track ids (track-overlay-8-1) → frontend lane ids (overlay-8). */
export function normalizePrimaryTrackId(trackId: string, apiType: string): string {
  const scoped = trackId.match(/^track-(.+)-1$/i)
  if (scoped && SCOPED_LANE_ID.test(scoped[1])) {
    return scoped[1]
  }
  if (/^track-video/i.test(trackId)) return 'video'
  if (/^track-audio/i.test(trackId)) return 'audio'
  if (/^track-captions/i.test(trackId)) return 'captions'
  if (/^track-music/i.test(trackId)) return 'music'
  if (/^track-camera/i.test(trackId)) return 'camera'
  if (/^track-caption-fx/i.test(trackId)) return 'caption-fx'
  if (/^track-effects/i.test(trackId)) return 'effects'
  if (apiType === 'overlay' && /^track-overlay-1$/i.test(trackId)) return 'overlay'
  const mapped = TYPE_TO_TRACK_ID[apiType]
  if (mapped) return mapped
  return trackId
}

function ensureTrackInList(tracks: Track[], trackId: string, apiTrack: ApiTimelineTrack): void {
  if (tracks.some((t) => t.id === trackId)) return
  const base = syntheticTrack(trackId)
  tracks.push({
    ...base,
    muted: apiTrack.muted ?? false,
    locked: apiTrack.locked ?? false,
    visible: apiTrack.visible ?? true,
  })
}

/** Convert backend timeline JSON → frontend store tracks + clips. */
export function apiTimelineToStore(data: ApiTimelineData): { tracks: Track[]; clips: Clip[] } {
  const tracks: Track[] = DEFAULT_TRACKS.map((t) => ({ ...t }))
  const clips: Clip[] = []

  for (const apiTrack of data.tracks ?? []) {
    const trackId = normalizePrimaryTrackId(apiTrack.id, apiTrack.type)
    const existing = tracks.find((t) => t.id === trackId)
    if (existing) {
      existing.muted   = apiTrack.muted   ?? existing.muted
      existing.locked  = apiTrack.locked  ?? existing.locked
      existing.visible = apiTrack.visible ?? existing.visible
      existing.label = syntheticTrack(trackId).label
    } else {
      ensureTrackInList(tracks, trackId, apiTrack)
    }

    for (const c of apiTrack.clips ?? []) {
      const duration = clipDuration(c)
      const clipType =
        apiTrack.type === 'audio'  ? 'audio'  :
        apiTrack.type === 'music'  ? 'music'  :
        apiTrack.type === 'overlay' ? 'overlay' :
        apiTrack.type === 'captions' ? 'caption' :
        apiTrack.type === 'effects' ? 'effect' :
        'video'

      clips.push({
        id:          c.id,
        trackId,
        startTime:   c.timeline_start,
        duration,
        label:       c.label ?? '',
        type:        clipType,
        sourceStart: c.source_start,
        sourceEnd:   c.source_end,
        speed:       c.speed ?? 1,
        effects:     mergeClipTransitions(parseEffects(c), c),
        gapResolutionNeeded: Boolean((c as { gap_resolution_needed?: boolean }).gap_resolution_needed),
        gapMetadata: (() => {
          const raw = (c as { gap_metadata?: Record<string, unknown> }).gap_metadata
          if (!raw) return undefined
          return {
            slotId: raw.slot_id as string | undefined,
            matchStatus: raw.match_status as string | undefined,
            matchScore: raw.match_score as number | undefined,
            description: raw.description as string | undefined,
            requirement: raw.requirement as Record<string, unknown> | undefined,
          }
        })(),
      })
    }
  }

  const { tracks: sfxTracks, clips: sfxClips } = migrateSfxClipsToLanes(tracks, clips)
  const { tracks: brollTracks, clips: brollClips } = migrateBrollClipsToTrack(sfxTracks, sfxClips)
  const { tracks: capTracks, clips: capClips } = migrateCaptionEffectClips(brollTracks, brollClips)
  const { tracks: camTracks, clips: camClips } = migrateCameraZoomClips(capTracks, capClips)
  return migrateElementClipsToDedicatedLanes(camTracks, camClips)
}

/** Convert frontend store → backend timeline JSON for PUT /timeline. */
const MIN_CLIP_DURATION = 0.1

function buildApiClip(c: Clip, primaryAssetId: string): ApiTimelineClip {
  const duration = Math.max(MIN_CLIP_DURATION, c.duration)
  const timelineStart = Math.max(0, c.startTime)
  const timelineEnd = timelineStart + duration
  const clipAssetId = resolveClipAssetId(c, primaryAssetId)

  let srcStart = c.sourceStart ?? timelineStart
  let srcEnd = c.sourceEnd ?? timelineStart + duration
  if (srcEnd <= srcStart) {
    srcEnd = srcStart + duration
  }

  const base: ApiTimelineClip = {
    id:             c.id,
    asset_id:       clipAssetId,
    source_start:   srcStart,
    source_end:     srcEnd,
    timeline_start: timelineStart,
    timeline_end:   timelineEnd,
    label:          c.label ?? '',
    speed:          Math.min(10, Math.max(0.1, c.speed ?? 1)),
    muted:          false,
    volume:         c.effects?.sfxVolume ?? (c.trackId === 'music' ? 0.35 : 1.0),
  }

  const effects: NonNullable<ApiTimelineClip['effects']> = []
  const isOverlayLane =
    c.type === 'overlay' ||
    c.trackId === 'broll' ||
    c.trackId.startsWith('broll-') ||
    c.trackId === 'images' ||
    c.trackId.startsWith('images-') ||
    c.trackId === 'overlay' ||
    c.trackId.startsWith('overlay-')
  if (isOverlayLane || c.effects?.visualType) {
    effects.push({
      type: 'visual_overlay',
      params: {
        visual_type:      c.effects?.visualType ?? '',
        template_id:      c.effects?.templateId ?? '',
        display_value:    c.effects?.displayValue ?? '',
        secondary_text:   c.effects?.secondaryText ?? '',
        suggested_visual: c.effects?.suggestedVisual ?? 'animated_graphic',
        nepali_label:     c.effects?.nepaliLabel ?? '',
        x_pct:            c.effects?.xPct,
        y_pct:            c.effects?.yPct,
        width_pct:        c.effects?.widthPct,
        height_pct:       c.effects?.heightPct,
        overlay_mode:     c.effects?.overlayMode,
        broll_type:       c.effects?.brollType,
        is_placeholder:   c.effects?.isPlaceholder,
        media_url:        c.effects?.mediaUrl,
        media_kind:       c.effects?.mediaKind,
        media_file_name:  c.effects?.mediaFileName,
        storage_key:      c.effects?.storageKey ?? c.effects?.musicStorageKey,
        media_asset_id:   c.effects?.mediaAssetId,
        scale:            c.effects?.scale,
        rotation:         c.effects?.rotation,
        overlay_entrance: c.effects?.overlayEntrance,
        overlay_exit:     c.effects?.overlayExit,
        motion_enter:     c.effects?.motionEnter,
        motion_exit:      c.effects?.motionExit,
        motion_enter_duration: c.effects?.motionEnterDuration,
        motion_exit_duration:  c.effects?.motionExitDuration,
        motion_spring:    c.effects?.motionSpring,
        motion_animation: c.effects?.motionAnimation,
        motion_props:     c.effects?.motionProps,
        brand_color:      c.effects?.brandColor,
        chart_as_broll:   c.effects?.chartAsBroll,
        image_opacity:    c.effects?.imageOpacity,
        brightness:       c.effects?.brightness,
        contrast:         c.effects?.contrast,
        saturation:       c.effects?.saturation,
        blur_px:          c.effects?.blurPx,
        corner_radius:    c.effects?.cornerRadius,
        border_width:     c.effects?.borderWidth,
        border_color:     c.effects?.borderColor,
        style_transfer:   c.effects?.styleTransfer,
      },
    })
  }
  if (c.effects?.colorFilterId) {
    effects.push({
      type: 'color_filter',
      params: {
        filter_id:  c.effects.colorFilterId,
        css_filter: c.effects.colorFilterCss ?? 'none',
      },
    })
  }
  if (c.effects?.styleTransferColorGrade) {
    effects.push({
      type: 'color_grade',
      params: c.effects.styleTransferColorGrade,
    })
  }
  if (c.effects?.transitionOut) {
    effects.push({
      type: 'transition_out',
      params: {
        type:     c.effects.transitionOut,
        duration: c.effects.transitionDuration ?? 0,
      },
    })
  }
  // Also persist transitions object for style-transfer round-trip
  if (c.effects?.transitionOut && c.effects.styleTransfer) {
    base.transitions = {
      out: {
        type: c.effects.transitionOut.replace('whip-pan', 'whip_pan').replace('zoom-in', 'zoom'),
        duration: c.effects.transitionDuration ?? 0,
      },
    }
  }
  if (c.type === 'caption') {
    effects.push({
      type: 'caption',
      params: {
        text:          c.effects?.displayValue ?? c.label,
        caption_index: c.effects?.captionIndex ?? 0,
      },
    })
  }
  if (c.type === 'effect' && c.effects?.effectType) {
    effects.push({
      type: 'keyframed_effect',
      params: {
        effect_type:     c.effects.effectType,
        preset_id:       c.effects.effectPresetId ?? '',
        parent_clip_id:  c.effects.parentClipId ?? '',
        css_filter:      c.effects.colorFilterCss ?? '',
        keyframes:       c.effects.keyframes ?? [],
        zoom_easing:     c.effects.zoomEasing ?? 'linear',
        style_tool_id:   c.effects.styleToolId ?? '',
      },
    })
  }
  if (c.effects?.sfxType) {
    effects.push({
      type: 'sfx_slot',
      params: {
        sfx_type: c.effects.sfxType,
        sfx_slug: c.effects.sfxSlug,
        volume: c.effects.sfxVolume ?? 0.35,
        style_transfer: true,
        is_placeholder: c.effects.isPlaceholder !== false,
        slot_label: c.label || `SFX: ${c.effects.sfxType}`,
      },
    })
  }
  if (c.effects?.musicBed || c.trackId === 'music') {
    effects.push({
      type: 'music_bed',
      params: {
        style_transfer: Boolean(c.effects?.styleTransfer),
        is_placeholder: c.effects?.isPlaceholder !== false,
        slot_label: c.effects?.displayValue || c.label || 'Background music',
        duck_under_voice: c.effects?.duckUnderVoice ?? false,
        storage_key: c.effects?.musicStorageKey ?? c.effects?.storageKey,
        media_url: c.effects?.mediaUrl,
        media_asset_id: c.effects?.mediaAssetId,
      },
    })
  }
  if (c.effects?.pacingSegment) {
    effects.push({
      type: 'style_pacing',
      params: { style_transfer: true, jump_cut: true },
    })
  }
  if (c.effects?.effectType === 'caption' || c.trackId === 'caption-fx') {
    effects.push({
      type: 'caption_style',
      params: {
        animation: c.effects?.captionAnimation ?? 'pop',
        max_words_per_line: c.effects?.maxWordsPerLine,
        case: c.effects?.captionCase,
        position: c.effects?.captionPosition,
        style_transfer: Boolean(c.effects?.styleTransfer),
      },
    })
  }
  if (effects.length > 0) base.effects = effects
  if (c.gapResolutionNeeded) base.gap_resolution_needed = true
  if (c.gapMetadata) {
    base.gap_metadata = {
      slot_id: c.gapMetadata.slotId,
      match_status: c.gapMetadata.matchStatus,
      match_score: c.gapMetadata.matchScore,
      description: c.gapMetadata.description,
      requirement: c.gapMetadata.requirement,
    }
  }
  return base
}

function resolveApiTrackType(trackId: string): ApiTimelineTrack['type'] {
  if (trackId === 'sfx' || trackId.startsWith('sfx-')) return 'audio'
  if (
    trackId === 'broll' ||
    trackId.startsWith('broll-') ||
    trackId === 'images' ||
    trackId.startsWith('images-') ||
    trackId === 'overlay' ||
    trackId.startsWith('overlay-')
  ) {
    return 'overlay'
  }
  return TRACK_ID_TO_TYPE[trackId] ?? 'video'
}

export function storeToApiTimeline(
  tracks: Track[],
  clips: Clip[],
  assetId: string,
  durationSeconds?: number,
  metadata?: Record<string, unknown>,
): ApiTimelineData {
  const seenClipIds = new Set<string>()
  const dur = durationSeconds ?? Math.max(
    0,
    ...clips.map((c) => c.startTime + c.duration),
  )

  const mergedTracks: Track[] = [...tracks]
  for (const clip of clips) {
    if (!mergedTracks.some((t) => t.id === clip.trackId)) {
      mergedTracks.push(syntheticTrack(clip.trackId))
    }
  }

  const apiTracks: ApiTimelineTrack[] = mergedTracks
    .map((t) => {
      const type = resolveApiTrackType(t.id)
      const trackClips = clips
        .filter((c) => c.trackId === t.id && c.duration > 0)
        .sort((a, b) => a.startTime - b.startTime)
        .filter((c) => {
          if (seenClipIds.has(c.id)) return false
          seenClipIds.add(c.id)
          return true
        })
        .map((c) => buildApiClip(c, assetId))

      return {
        id:      `track-${t.id}-1`,
        type,
        name:    t.label || TRACK_LABELS[t.id] || t.id,
        muted:   t.muted,
        locked:  t.locked,
        visible: t.visible,
        clips:   trackClips,
      }
    })
    // Empty effects track breaks saves on API builds before TrackType.EFFECTS.
    .filter((t) => t.type !== 'effects' || t.clips.length > 0)

  return {
    schema_version: 1,
    tracks: apiTracks,
    global_settings: {
      resolution:        '1920x1080',
      fps:               30,
      audio_sample_rate: 48000,
      duration:          Math.max(dur, MIN_CLIP_DURATION),
    },
    metadata: metadata ?? {},
  }
}

/** True when the saved timeline has at least one video clip. */
export function apiTimelineHasVideo(data: ApiTimelineData | null | undefined): boolean {
  if (!data?.tracks) return false
  return data.tracks.some(
    (t) => t.type === 'video' && Array.isArray(t.clips) && t.clips.length > 0,
  )
}

/** Primary source footage asset id from saved timeline JSON (first video-track clip). */
export function timelinePrimaryAssetId(data: ApiTimelineData): string | null {
  for (const track of data.tracks ?? []) {
    if (track.type !== 'video') continue
    for (const clip of track.clips ?? []) {
      if (clip.asset_id) return clip.asset_id
    }
  }
  return null
}

/** True when saved timeline belongs to a different main video than the current asset. */
export function isTimelineStaleForAsset(data: ApiTimelineData, assetId: string): boolean {
  const saved = timelinePrimaryAssetId(data)
  return saved != null && saved !== assetId
}

/** Replace main video/audio on a saved timeline while keeping B-roll, captions, overlays, etc. */
export function upgradeTimelinePrimaryAsset(
  data: ApiTimelineData,
  asset: { id: string; filename: string; durationSeconds: number },
): ApiTimelineData {
  const { tracks, clips } = apiTimelineToStore(data)
  const withoutPrimary = clips.filter(
    (c) => !(c.trackId === 'video' && c.type === 'video')
      && !(c.trackId === 'audio' && c.type === 'audio'),
  )
  const dur = Math.max(0.1, asset.durationSeconds || 0)
  const clipId = `clip-${asset.id.slice(0, 8)}`
  const nextClips = [
    ...withoutPrimary,
    {
      id: clipId,
      trackId: 'video',
      startTime: 0,
      duration: dur,
      label: asset.filename || 'Main video',
      type: 'video' as const,
      sourceStart: 0,
      sourceEnd: dur,
    },
    {
      id: `${clipId}-audio`,
      trackId: 'audio',
      startTime: 0,
      duration: dur,
      label: 'Audio',
      type: 'audio' as const,
      sourceStart: 0,
      sourceEnd: dur,
    },
  ]
  const nextTracks = tracks.some((t) => t.id === 'video')
    ? tracks
    : [{ id: 'video', label: 'Video', color: '#3B82F6', muted: false, locked: false, visible: true }, ...tracks]
  return storeToApiTimeline(nextTracks, nextClips, asset.id, dur, data.metadata)
}
