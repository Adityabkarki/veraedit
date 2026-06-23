/**
 * Auto-stack timeline lanes when clips overlap (B-roll, elements, images, SFX).
 */

import type { Clip, Track } from '@/stores/timelineStore'

export interface TrackFamilyConfig {
  prefix: string
  baseLabel: string
  color: string
  /** Insert new lanes after this track id when possible */
  insertAfter?: string
}

export const BROLL_FAMILY: TrackFamilyConfig = {
  prefix: 'broll',
  baseLabel: 'B-Roll',
  color: '#374151',
  insertAfter: 'camera',
}

export const OVERLAY_FAMILY: TrackFamilyConfig = {
  prefix: 'overlay',
  baseLabel: 'Elements',
  color: '#EC4899',
  insertAfter: 'caption-fx',
}

export const IMAGES_FAMILY: TrackFamilyConfig = {
  prefix: 'images',
  baseLabel: 'Image overlays',
  color: '#06B6D4',
  insertAfter: 'overlay',
}

function rangesOverlap(start: number, duration: number, clip: Clip): boolean {
  const end = start + duration
  const clipEnd = clip.startTime + clip.duration
  return start < clipEnd - 0.001 && end > clip.startTime + 0.001
}

function familyTrackIds(tracks: Track[], prefix: string): string[] {
  return tracks
    .filter((t) => t.id === prefix || t.id.startsWith(`${prefix}-`))
    .map((t) => t.id)
}

function laneLabel(baseLabel: string, index: number): string {
  return index <= 1 ? baseLabel : `${baseLabel} ${index}`
}

function insertTrack(tracks: Track[], track: Track, insertAfter?: string): Track[] {
  if (tracks.some((t) => t.id === track.id)) return tracks
  if (insertAfter) {
    const idx = tracks.findIndex((t) => t.id === insertAfter)
    if (idx >= 0) {
      const next = [...tracks]
      next.splice(idx + 1, 0, track)
      return next
    }
  }
  return [...tracks, track]
}

/** Pick a lane with no time overlap, or create broll-2 / overlay-2 / images-2 automatically. */
export function allocateStackedTrack(
  tracks: Track[],
  clips: Clip[],
  startTime: number,
  duration: number,
  family: TrackFamilyConfig,
): { tracks: Track[]; trackId: string } {
  let nextTracks = [...tracks]
  const ids = familyTrackIds(nextTracks, family.prefix)

  if (ids.length === 0) {
    const trackId = family.prefix
    nextTracks = insertTrack(
      nextTracks,
      {
        id: trackId,
        label: family.baseLabel,
        color: family.color,
        muted: false,
        locked: false,
        visible: true,
      },
      family.insertAfter,
    )
    return { tracks: nextTracks, trackId }
  }

  for (const trackId of ids) {
    const busy = clips.some(
      (c) => c.trackId === trackId && rangesOverlap(startTime, duration, c),
    )
    if (!busy) return { tracks: nextTracks, trackId }
  }

  const nextIndex = ids.length + 1
  const trackId = `${family.prefix}-${nextIndex}`
  nextTracks = insertTrack(
    nextTracks,
    {
      id: trackId,
      label: laneLabel(family.baseLabel, nextIndex),
      color: family.color,
      muted: false,
      locked: false,
      visible: true,
    },
    ids[ids.length - 1],
  )
  return { tracks: nextTracks, trackId }
}

/**
 * One clip per lane — always pick an empty family lane or create a new one.
 * Used for Elements / Images so each graphic is on its own row for editing.
 */
export function allocateDedicatedTrack(
  tracks: Track[],
  clips: Clip[],
  family: TrackFamilyConfig,
): { tracks: Track[]; trackId: string } {
  let nextTracks = [...tracks]
  const ids = familyTrackIds(nextTracks, family.prefix)

  if (ids.length === 0) {
    const trackId = family.prefix
    nextTracks = insertTrack(
      nextTracks,
      {
        id: trackId,
        label: family.baseLabel,
        color: family.color,
        muted: false,
        locked: false,
        visible: true,
      },
      family.insertAfter,
    )
    return { tracks: nextTracks, trackId }
  }

  for (const trackId of ids) {
    const occupied = clips.some((c) => c.trackId === trackId)
    if (!occupied) return { tracks: nextTracks, trackId }
  }

  const nextIndex = ids.length + 1
  const trackId = `${family.prefix}-${nextIndex}`
  nextTracks = insertTrack(
    nextTracks,
    {
      id: trackId,
      label: laneLabel(family.baseLabel, nextIndex),
      color: family.color,
      muted: false,
      locked: false,
      visible: true,
    },
    ids[ids.length - 1],
  )
  return { tracks: nextTracks, trackId }
}

function isOverlayElementClip(c: Clip): boolean {
  return (
    isFamilyTrack(c.trackId, OVERLAY_FAMILY.prefix) &&
    c.type === 'overlay' &&
    Boolean(c.effects?.visualType) &&
    c.effects?.visualType !== 'broll_overlay'
  )
}

/** Split stacked element clips onto separate lanes (e.g. after API import). */
export function migrateElementClipsToDedicatedLanes(
  tracks: Track[],
  clips: Clip[],
): { tracks: Track[]; clips: Clip[] } {
  let nextTracks = [...tracks]
  const nextClips = clips.map((c) => ({ ...c }))

  const overlayElements = nextClips
    .filter(isOverlayElementClip)
    .sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id))

  for (const clip of overlayElements) {
    const siblings = nextClips.filter(
      (c) => c.id !== clip.id && c.trackId === clip.trackId && isOverlayElementClip(c),
    )
    if (siblings.length === 0) continue

    const others = nextClips.filter((c) => c.id !== clip.id)
    const alloc = allocateDedicatedTrack(nextTracks, others, OVERLAY_FAMILY)
    nextTracks = alloc.tracks
    clip.trackId = alloc.trackId
    if (clip.effects) {
      clip.effects = offsetEffectsForLane(clip.effects, clip.trackId, OVERLAY_FAMILY.prefix) as Clip['effects']
    }
  }

  const imageClips = nextClips
    .filter((c) => isFamilyTrack(c.trackId, IMAGES_FAMILY.prefix))
    .sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id))

  for (const clip of imageClips) {
    const siblings = nextClips.filter(
      (c) => c.id !== clip.id && c.trackId === clip.trackId && isFamilyTrack(c.trackId, IMAGES_FAMILY.prefix),
    )
    if (siblings.length === 0) continue

    const others = nextClips.filter((c) => c.id !== clip.id)
    const alloc = allocateDedicatedTrack(nextTracks, others, IMAGES_FAMILY)
    nextTracks = alloc.tracks
    clip.trackId = alloc.trackId
  }

  return { tracks: nextTracks, clips: nextClips }
}

export function isFamilyTrack(trackId: string, prefix: string): boolean {
  return trackId === prefix || trackId.startsWith(`${prefix}-`)
}

export function syntheticTrack(trackId: string): Track {
  const overlayMatch = trackId.match(/^overlay(?:-(\d+))?$/)
  if (overlayMatch) {
    const n = overlayMatch[1] ? Number.parseInt(overlayMatch[1], 10) : 1
    return {
      id: trackId,
      label: n <= 1 ? 'Elements' : `Elements ${n}`,
      color: '#EC4899',
      muted: false,
      locked: false,
      visible: true,
    }
  }
  const brollMatch = trackId.match(/^broll(?:-(\d+))?$/)
  if (brollMatch) {
    const n = brollMatch[1] ? Number.parseInt(brollMatch[1], 10) : 1
    return {
      id: trackId,
      label: n <= 1 ? 'B-Roll' : `B-Roll ${n}`,
      color: '#374151',
      muted: false,
      locked: false,
      visible: true,
    }
  }
  const imagesMatch = trackId.match(/^images(?:-(\d+))?$/)
  if (imagesMatch) {
    const n = imagesMatch[1] ? Number.parseInt(imagesMatch[1], 10) : 1
    return {
      id: trackId,
      label: n <= 1 ? IMAGES_FAMILY.baseLabel : `${IMAGES_FAMILY.baseLabel} ${n}`,
      color: IMAGES_FAMILY.color,
      muted: false,
      locked: false,
      visible: true,
    }
  }
  return {
    id: trackId,
    label: trackId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    color: '#6B7280',
    muted: false,
    locked: false,
    visible: true,
  }
}

/** Core A/V lanes — always visible so main media stays editable. */
const PINNED_TRACK_IDS = ['video', 'audio'] as const

const PINNED_TRACK_DEFAULTS: Record<(typeof PINNED_TRACK_IDS)[number], Track> = {
  video: {
    id: 'video',
    label: 'Video',
    color: '#3B82F6',
    muted: false,
    locked: false,
    visible: true,
  },
  audio: {
    id: 'audio',
    label: 'Audio',
    color: '#8B5CF6',
    muted: false,
    locked: false,
    visible: true,
  },
}

function familySortRank(trackId: string): number {
  if (trackId === 'video') return 0
  if (trackId === 'camera') return 10
  if (isFamilyTrack(trackId, 'broll')) return 20
  if (trackId === 'audio') return 30
  if (trackId === 'captions') return 40
  if (trackId === 'caption-fx') return 50
  if (isFamilyTrack(trackId, 'overlay')) return 60
  if (isFamilyTrack(trackId, 'images')) return 70
  if (trackId === 'effects') return 80
  if (trackId === 'music') return 90
  if (isFamilyTrack(trackId, 'sfx')) return 100
  return 200
}

function familyPrefixForSort(trackId: string): string {
  if (isFamilyTrack(trackId, 'overlay')) return 'overlay'
  if (isFamilyTrack(trackId, 'images')) return 'images'
  if (isFamilyTrack(trackId, 'broll')) return 'broll'
  if (isFamilyTrack(trackId, 'sfx')) return 'sfx'
  return trackId
}

/** Stable lane order: Video → Audio → Elements 1,2,3… → Image overlays 1,2… */
export function sortVisibleTracks(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) => {
    const ra = familySortRank(a.id)
    const rb = familySortRank(b.id)
    if (ra !== rb) return ra - rb
    const la = familyLaneIndex(a.id, familyPrefixForSort(a.id))
    const lb = familyLaneIndex(b.id, familyPrefixForSort(b.id))
    if (la !== lb) return la - lb
    return a.id.localeCompare(b.id)
  })
}

/** Hide empty overlay/B-roll lanes; always keep Video + Audio rows. */
export function tracksWithContent(tracks: Track[], clips: Clip[]): Track[] {
  const idsWithClips = new Set(clips.map((c) => c.trackId))
  const byId = new Map<string, Track>()

  for (const t of tracks) {
    if (idsWithClips.has(t.id)) byId.set(t.id, t)
  }
  for (const id of idsWithClips) {
    if (!byId.has(id)) byId.set(id, syntheticTrack(id))
  }

  for (const pinnedId of PINNED_TRACK_IDS) {
    if (!byId.has(pinnedId)) {
      byId.set(
        pinnedId,
        tracks.find((t) => t.id === pinnedId) ?? PINNED_TRACK_DEFAULTS[pinnedId],
      )
    }
  }

  return sortVisibleTracks(
    [...byId.values()].map((t) => ({
      ...t,
      label: syntheticTrack(t.id).label,
    })),
  )
}

/** True when the timeline has at least one clip on the video lane. */
export function hasVideoLaneClip(clips: Clip[]): boolean {
  return clips.some((c) => c.trackId === 'video' && c.type === 'video')
}

/** Inject primary video + audio clips when the saved timeline lost them (e.g. after AI edits). */
export function ensurePrimaryMediaClips(
  tracks: Track[],
  clips: Clip[],
  asset: { id: string; filename: string; durationSeconds: number },
): { tracks: Track[]; clips: Clip[] } {
  if (hasVideoLaneClip(clips) || asset.durationSeconds <= 0) {
    return { tracks, clips }
  }

  const dur = Math.max(0.1, asset.durationSeconds)
  const clipId = `clip-${asset.id.slice(0, 8)}`
  const nextClips: Clip[] = [
    ...clips,
    {
      id: clipId,
      trackId: 'video',
      startTime: 0,
      duration: dur,
      label: asset.filename || 'Main video',
      type: 'video',
      sourceStart: 0,
      sourceEnd: dur,
    },
  ]

  if (!clips.some((c) => c.trackId === 'audio')) {
    nextClips.push({
      id: `${clipId}-audio`,
      trackId: 'audio',
      startTime: 0,
      duration: dur,
      label: 'Audio',
      type: 'audio',
      sourceStart: 0,
      sourceEnd: dur,
    })
  }

  const nextTracks = tracks.some((t) => t.id === 'video')
    ? tracks
    : [PINNED_TRACK_DEFAULTS.video, ...tracks]

  return { tracks: nextTracks, clips: nextClips }
}

/** Lane index within a stacked family (overlay → 1, overlay-2 → 2, …). */
export function familyLaneIndex(trackId: string, prefix: string): number {
  if (trackId === prefix) return 1
  const match = trackId.match(new RegExp(`^${prefix}-(\\d+)$`))
  return match ? Number.parseInt(match[1], 10) : 1
}

/** Nudge stacked overlays so multiple elements stay readable on preview. */
export function offsetEffectsForLane(
  effects: Record<string, unknown>,
  trackId: string,
  prefix: string,
): Record<string, unknown> {
  const lane = familyLaneIndex(trackId, prefix)
  if (lane <= 1) return effects
  const x = Number(effects.xPct ?? 50)
  const y = Number(effects.yPct ?? 50)
  const shift = (lane - 1) * 10
  return {
    ...effects,
    xPct: Math.max(8, Math.min(92, x - shift * 0.35)),
    yPct: Math.max(10, Math.min(92, y + shift)),
  }
}
