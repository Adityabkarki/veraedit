import { describe, it, expect } from 'vitest'
import {
  allocateStackedTrack,
  allocateDedicatedTrack,
  BROLL_FAMILY,
  OVERLAY_FAMILY,
  tracksWithContent,
  sortVisibleTracks,
  offsetEffectsForLane,
  migrateElementClipsToDedicatedLanes,
  ensurePrimaryMediaClips,
  hasVideoLaneClip,
} from '@/lib/timelineLayers'
import type { Clip, Track } from '@/stores/timelineStore'
import { INITIAL_TRACKS } from '@/stores/timelineStore'

describe('allocateStackedTrack', () => {
  it('creates broll-2 when base lane is occupied', () => {
    const tracks = INITIAL_TRACKS.map((t) => ({ ...t }))
    const clips: Clip[] = [
      {
        id: 'b1',
        trackId: 'broll',
        startTime: 2,
        duration: 3,
        label: 'B-Roll',
        type: 'overlay',
      },
    ]
    const { tracks: next, trackId } = allocateStackedTrack(tracks, clips, 2.5, 2, BROLL_FAMILY)
    expect(trackId).toBe('broll-2')
    expect(next.some((t) => t.id === 'broll-2')).toBe(true)
  })
})

describe('allocateDedicatedTrack', () => {
  it('creates a new lane for each element even when times do not overlap', () => {
    const tracks = INITIAL_TRACKS.map((t) => ({ ...t }))
    const clips: Clip[] = [
      {
        id: 'e1',
        trackId: 'overlay',
        startTime: 0,
        duration: 3,
        label: 'CTA',
        type: 'overlay',
        effects: { visualType: 'cta' },
      },
    ]
    const { trackId } = allocateDedicatedTrack(tracks, clips, OVERLAY_FAMILY)
    expect(trackId).toBe('overlay-2')
  })
})

describe('migrateElementClipsToDedicatedLanes', () => {
  it('splits multiple elements on one lane into separate rows', () => {
    const tracks = INITIAL_TRACKS.map((t) => ({ ...t }))
    const clips: Clip[] = [
      {
        id: 'a',
        trackId: 'overlay',
        startTime: 0,
        duration: 2,
        label: 'A',
        type: 'overlay',
        effects: { visualType: 'cta' },
      },
      {
        id: 'b',
        trackId: 'overlay',
        startTime: 5,
        duration: 2,
        label: 'B',
        type: 'overlay',
        effects: { visualType: 'statistic' },
      },
      {
        id: 'c',
        trackId: 'overlay',
        startTime: 10,
        duration: 2,
        label: 'C',
        type: 'overlay',
        effects: { visualType: 'large_number' },
      },
    ]
    const { clips: next } = migrateElementClipsToDedicatedLanes(tracks, clips)
    const lanes = new Set(next.map((c) => c.trackId))
    expect(lanes.size).toBe(3)
    expect(next.every((c) => {
      const onLane = next.filter((x) => x.trackId === c.trackId)
      return onLane.length === 1
    })).toBe(true)
  })
})

describe('sortVisibleTracks', () => {
  it('orders element lanes numerically after pinned video/audio', () => {
    const tracks = [
      { id: 'overlay-8', label: 'Elements 8', color: '#EC4899', muted: false, locked: false, visible: true },
      { id: 'overlay-2', label: 'Elements 2', color: '#EC4899', muted: false, locked: false, visible: true },
      { id: 'video', label: 'Video', color: '#3B82F6', muted: false, locked: false, visible: true },
      { id: 'overlay', label: 'Elements', color: '#EC4899', muted: false, locked: false, visible: true },
      { id: 'images-2', label: 'Image overlays 2', color: '#06B6D4', muted: false, locked: false, visible: true },
      { id: 'audio', label: 'Audio', color: '#8B5CF6', muted: false, locked: false, visible: true },
    ]
    expect(sortVisibleTracks(tracks).map((t) => t.id)).toEqual([
      'video',
      'audio',
      'overlay',
      'overlay-2',
      'overlay-8',
      'images-2',
    ])
  })
})

describe('tracksWithContent', () => {
  it('hides empty overlay lanes but always keeps video and audio rows', () => {
    const tracks = INITIAL_TRACKS.map((t) => ({ ...t }))
    const clips: Clip[] = [
      { id: 'v1', trackId: 'video', startTime: 0, duration: 5, label: 'V', type: 'video' },
      { id: 'o1', trackId: 'overlay-2', startTime: 1, duration: 2, label: 'El', type: 'overlay' },
    ]
    const visible = tracksWithContent(tracks, clips)
    expect(visible.map((t) => t.id)).toEqual(['video', 'audio', 'overlay-2'])
  })

  it('shows video lane even when only elements exist', () => {
    const tracks = INITIAL_TRACKS.map((t) => ({ ...t }))
    const clips: Clip[] = [
      { id: 'o1', trackId: 'overlay', startTime: 0, duration: 2, label: 'CTA', type: 'overlay' },
    ]
    const visible = tracksWithContent(tracks, clips)
    expect(visible.some((t) => t.id === 'video')).toBe(true)
    expect(visible.some((t) => t.id === 'audio')).toBe(true)
    expect(visible.some((t) => t.id === 'camera')).toBe(false)
  })
})

describe('ensurePrimaryMediaClips', () => {
  it('adds main video clip when timeline lost it', () => {
    const tracks = INITIAL_TRACKS.map((t) => ({ ...t }))
    const clips: Clip[] = [
      { id: 'o1', trackId: 'overlay', startTime: 0, duration: 2, label: 'CTA', type: 'overlay' },
    ]
    const { clips: next } = ensurePrimaryMediaClips(tracks, clips, {
      id: 'asset-12345678',
      filename: 'Cam B.mp4',
      durationSeconds: 120,
    })
    expect(hasVideoLaneClip(next)).toBe(true)
    expect(next.find((c) => c.trackId === 'video')?.label).toBe('Cam B.mp4')
  })
})

describe('offsetEffectsForLane', () => {
  it('staggers y position on stacked overlay lanes', () => {
    const shifted = offsetEffectsForLane({ xPct: 50, yPct: 50 }, 'overlay-3', 'overlay')
    expect(shifted.yPct).toBeGreaterThan(50)
  })
})

describe('buildUnifiedCatalog', () => {
  it('dedupes transitions already in toolbox', async () => {
    const { buildUnifiedCatalog } = await import('@/lib/effectsCatalog')
    const items = buildUnifiedCatalog([
      {
        id: 'dissolve_transition',
        name: 'Dissolve',
        category: 'transitions',
        description: '',
        available: true,
        discovered: true,
        status: 'supported',
        renderer: 'transition_renderer',
      },
    ])
    const legacyDissolve = items.filter((i) => i.id === 'legacy-transition-dissolve')
    expect(legacyDissolve).toHaveLength(0)
  })
})
