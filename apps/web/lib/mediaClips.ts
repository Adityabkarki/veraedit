/**
 * SFX + B-roll toolbox insertion — dedicated timeline layers (not text overlays).
 */

import type { Clip, Track } from '@/stores/timelineStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { commitTimelineClips, getFullTimelineClips } from '@/lib/editor/timelineClipUpdates'
import { allocateStackedTrack, BROLL_FAMILY, OVERLAY_FAMILY, IMAGES_FAMILY } from '@/lib/timelineLayers'
import { isChartOrProcessClip } from '@/lib/chartVisualTypes'
import { resolveSfxSlug } from '@/lib/sfxLibrary'

export interface SfxToolConfig {
  sfxType: string
  duration: number
  label: string
}

/** Toolbox / recipe SFX tool → preview sound + clip metadata. */
export const SFX_TOOL_CONFIG: Record<string, SfxToolConfig> = {
  sfx_on_cut: { sfxType: 'whoosh', duration: 0.35, label: 'Whoosh' },
  sfx_whoosh_cut: { sfxType: 'whoosh', duration: 0.35, label: 'Whoosh' },
  sfx_sub_bass_thud: { sfxType: 'sub_bass', duration: 0.32, label: 'Sub bass' },
  sfx_shutter_click: { sfxType: 'shutter_click', duration: 0.15, label: 'Shutter' },
  sfx_impact_hit: { sfxType: 'impact_hit', duration: 0.18, label: 'Impact' },
  sfx_pop: { sfxType: 'pop', duration: 0.12, label: 'Pop' },
  sfx_swipe: { sfxType: 'swipe', duration: 0.28, label: 'Swipe' },
  sfx_glitch: { sfxType: 'glitch', duration: 0.2, label: 'Glitch' },
  sfx_riser: { sfxType: 'riser', duration: 0.6, label: 'Riser' },
  sfx_notification: { sfxType: 'notification', duration: 0.25, label: 'Ding' },
}

export const BROLL_TOOL_IDS = new Set([
  'broll_insert',
  'screen_broll_cutaway',
  'shot_broll_news',
  'broll_documentary',
])

const BROLL_TYPE_BY_TOOL: Record<string, string> = {
  screen_broll_cutaway: 'screen_recording',
  shot_broll_news: 'news_archive',
  broll_documentary: 'documentary',
  broll_insert: 'cutaway',
}

/** True for any B-roll slot clip (timeline or preview). Chart/process fullscreen layers are not media B-roll. */
export function isBrollClip(c: Clip): boolean {
  if (isChartOrProcessClip(c)) return false
  const vt = (c.effects?.visualType ?? '').toLowerCase()
  return (
    c.trackId === 'broll' ||
    c.trackId.startsWith('broll-') ||
    vt === 'broll_overlay' ||
    vt === 'broll_insert' ||
    vt === 'broll_cutaway' ||
    vt === 'screen_recording' ||
    Boolean(c.effects?.brollType) ||
    c.effects?.suggestedVisual === 'broll_placeholder'
  )
}

export function ensureBrollTrack(tracks: Track[]): Track[] {
  if (tracks.some((t) => t.id === 'broll')) return tracks
  const brollTrack: Track = {
    id: 'broll',
    label: 'B-Roll',
    color: '#374151',
    muted: false,
    locked: false,
    visible: true,
  }
  const videoIdx = tracks.findIndex((t) => t.id === 'video')
  if (videoIdx === -1) return [...tracks, brollTrack]
  const next = [...tracks]
  next.splice(videoIdx + 1, 0, brollTrack)
  return next
}

/** Normalize legacy overlay B-roll clips onto the dedicated B-Roll track. */
export function migrateBrollClipsToTrack(
  tracks: Track[],
  clips: Clip[],
): { tracks: Track[]; clips: Clip[] } {
  const nextTracks = ensureBrollTrack(tracks)
  const nextClips = clips.map((c) => {
    if (!isBrollClip(c)) return c
    return {
      ...c,
      trackId: 'broll',
      label: 'B-Roll',
      type: 'overlay' as const,
      effects: {
        ...c.effects,
        visualType: 'broll_overlay',
        overlayMode: 'fullscreen' as const,
        widthPct: 100,
        heightPct: 100,
        xPct: 50,
        yPct: 50,
        displayValue: '',
        isPlaceholder: !c.effects?.mediaUrl,
        suggestedVisual: 'broll_placeholder',
      },
    }
  })
  return { tracks: nextTracks, clips: nextClips }
}

const BROLL_DURATION_BY_TOOL: Record<string, number> = {
  screen_broll_cutaway: 4,
  shot_broll_news: 3,
  broll_documentary: 4,
  broll_insert: 3,
}

export function isSfxToolId(toolId: string): boolean {
  return toolId.startsWith('sfx_') || toolId in SFX_TOOL_CONFIG
}

export function isBrollToolId(toolId: string): boolean {
  return BROLL_TOOL_IDS.has(toolId) || (toolId.includes('broll') && !toolId.startsWith('image_'))
}

export const IMAGE_TOOL_IDS = new Set([
  'image_photo',
  'image_sticker',
  'image_shape',
])

export function isImageToolId(toolId: string): boolean {
  return IMAGE_TOOL_IDS.has(toolId) || toolId.startsWith('image_')
}

export function isImageClip(c: Clip): boolean {
  const vt = (c.effects?.visualType ?? '').toLowerCase()
  return (
    c.trackId === 'images' ||
    c.trackId.startsWith('images-') ||
    vt === 'image_slot' ||
    vt === 'image_sticker' ||
    vt === 'image_shape' ||
    (Boolean(c.effects?.mediaUrl) && c.effects?.mediaKind === 'image' && isImageToolId(c.effects?.styleToolId ?? ''))
  )
}

export function sfxConfigForTool(toolId: string): SfxToolConfig {
  return (
    SFX_TOOL_CONFIG[toolId] ?? {
      sfxType: toolId.replace(/^sfx_/, '').replace(/_/g, ' ') || 'whoosh',
      duration: 0.35,
      label: toolId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    }
  )
}

function rangesOverlap(
  start: number,
  duration: number,
  clip: Clip,
): boolean {
  const end = start + duration
  const clipEnd = clip.startTime + clip.duration
  return start < clipEnd - 0.001 && end > clip.startTime + 0.001
}

/** Pick an SFX lane with no overlap; create a new lane when all are busy. */
export function allocateSfxTrack(
  tracks: Track[],
  clips: Clip[],
  startTime: number,
  duration: number,
): { tracks: Track[]; trackId: string } {
  const sfxIds = tracks
    .filter((t) => t.id === 'sfx' || t.id.startsWith('sfx-'))
    .map((t) => t.id)

  if (sfxIds.length === 0) {
    return {
      tracks: [
        ...tracks,
        {
          id: 'sfx',
          label: 'SFX',
          color: '#F59E0B',
          muted: false,
          locked: false,
          visible: true,
        },
      ],
      trackId: 'sfx',
    }
  }

  for (const trackId of sfxIds) {
    const busy = clips.some(
      (c) => c.trackId === trackId && rangesOverlap(startTime, duration, c),
    )
    if (!busy) return { tracks, trackId }
  }

  const nextIndex = sfxIds.length + 1
  const trackId = `sfx-${nextIndex}`
  return {
    tracks: [
      ...tracks,
      {
        id: trackId,
        label: `SFX ${nextIndex}`,
        color: '#F59E0B',
        muted: false,
        locked: false,
        visible: true,
      },
    ],
    trackId,
  }
}

/** Move imported / legacy SFX clips onto dedicated SFX lanes. */
export function migrateSfxClipsToLanes(
  tracks: Track[],
  clips: Clip[],
): { tracks: Track[]; clips: Clip[] } {
  let nextTracks = [...tracks]
  const nextClips = clips.map((c) => ({ ...c }))

  for (const clip of nextClips) {
    if (!clip.effects?.sfxType) continue
    if (clip.trackId === 'sfx' || clip.trackId.startsWith('sfx-')) continue

    const others = nextClips.filter((c) => c.id !== clip.id)
    const alloc = allocateSfxTrack(nextTracks, others, clip.startTime, clip.duration)
    nextTracks = alloc.tracks
    clip.trackId = alloc.trackId
    clip.type = 'audio'
    const cfg = Object.values(SFX_TOOL_CONFIG).find((x) => x.sfxType === clip.effects?.sfxType)
    clip.label = cfg ? `SFX: ${cfg.label}` : clip.label || `SFX: ${clip.effects.sfxType}`
  }

  return { tracks: nextTracks, clips: nextClips }
}

export function insertSfxAt(
  toolId: string,
  startTime: number,
  volume = 0.35,
): string | null {
  const cfg = sfxConfigForTool(toolId)
  const duration = Math.max(0.1, cfg.duration)
  const { tracks } = useTimelineStore.getState()
  const clips = getFullTimelineClips()
  const { tracks: nextTracks, trackId } = allocateSfxTrack(
    tracks,
    clips,
    startTime,
    duration,
  )

  const sfxSlug = resolveSfxSlug(cfg.sfxType, toolId)
  const id = `sfx-${Date.now().toString(36)}`
  const clip: Clip = {
    id,
    trackId,
    startTime,
    duration,
    label: `SFX: ${cfg.label}`,
    type: 'audio',
    effects: {
      sfxType: cfg.sfxType,
      sfxSlug,
      sfxVolume: volume,
      styleToolId: toolId,
      styleTransfer: true,
      isPlaceholder: false,
    },
  }

  commitTimelineClips(
    (allClips) => [...allClips, clip],
    {
      tracks: nextTracks,
      lastEditAction: `Added ${cfg.label} sound`,
      selectedClipIds: [id],
    },
  )
  return id
}

export function insertBrollAt(
  toolId: string,
  _toolName: string,
  startTime: number,
  duration = BROLL_DURATION_BY_TOOL[toolId] ?? 3,
): string | null {
  const brollType = BROLL_TYPE_BY_TOOL[toolId] ?? 'cutaway'

  const clipDuration = Math.max(0.5, duration)
  const { tracks } = useTimelineStore.getState()
  const clips = getFullTimelineClips()
  const { tracks: nextTracks, trackId } = allocateStackedTrack(
    tracks,
    clips,
    startTime,
    clipDuration,
    BROLL_FAMILY,
  )

  const id = `broll-${Date.now().toString(36)}`
  const clip: Clip = {
    id,
    trackId,
    startTime,
    duration: clipDuration,
    label: 'B-Roll',
    type: 'overlay',
    effects: {
      visualType: 'broll_overlay',
      overlayMode: 'fullscreen',
      widthPct: 100,
      heightPct: 100,
      xPct: 50,
      yPct: 50,
      brollType,
      isPlaceholder: true,
      displayValue: '',
      suggestedVisual: 'broll_placeholder',
      styleToolId: toolId,
    },
  }

  commitTimelineClips(
    (allClips) => [...allClips, clip],
    {
      tracks: nextTracks,
      lastEditAction: 'Added B-Roll slot',
      selectedClipIds: [id],
    },
  )
  return id
}
