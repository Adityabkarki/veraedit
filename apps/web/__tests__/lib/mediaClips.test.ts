/**
 * Tests for lib/mediaClips.ts — SFX lanes and B-roll placeholders.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  allocateSfxTrack,
  insertBrollAt,
  insertSfxAt,
  migrateBrollClipsToTrack,
  migrateSfxClipsToLanes,
} from '@/lib/mediaClips'
import { useTimelineStore, INITIAL_CLIPS, INITIAL_TRACKS } from '@/stores/timelineStore'
import type { Clip } from '@/stores/timelineStore'

beforeEach(() => {
  useTimelineStore.setState({
    tracks: INITIAL_TRACKS.map((t) => ({ ...t })),
    clips: INITIAL_CLIPS.map((c) => ({ ...c })),
    selectedClipIds: [],
    playheadTime: 1,
    undoStack: [],
    redoStack: [],
    lastEditAction: null,
  })
})

describe('allocateSfxTrack', () => {
  it('creates the first SFX lane when none exist', () => {
    const { tracks, trackId } = allocateSfxTrack(INITIAL_TRACKS, [], 2, 0.3)
    expect(trackId).toBe('sfx')
    expect(tracks.some((t) => t.id === 'sfx')).toBe(true)
  })

  it('stacks a second lane when the first is busy', () => {
    const clips: Clip[] = [{
      id: 's1',
      trackId: 'sfx',
      startTime: 2,
      duration: 0.4,
      label: 'SFX: Whoosh',
      type: 'audio',
      effects: { sfxType: 'whoosh' },
    }]
    const tracks = [
      ...INITIAL_TRACKS,
      { id: 'sfx', label: 'SFX', color: '#F59E0B', muted: false, locked: false, visible: true },
    ]
    const { trackId } = allocateSfxTrack(tracks, clips, 2.1, 0.3)
    expect(trackId).toBe('sfx-2')
  })
})

describe('insertSfxAt', () => {
  it('adds an audio clip on the SFX lane instead of a text overlay', () => {
    insertSfxAt('sfx_on_cut', 5)
    const { clips, tracks } = useTimelineStore.getState()
    const sfx = clips.find((c) => c.effects?.sfxType === 'whoosh')
    expect(sfx?.trackId).toBe('sfx')
    expect(sfx?.type).toBe('audio')
    expect(sfx?.effects?.sfxSlug).toBe('whoosh')
    expect(sfx?.effects?.isPlaceholder).toBe(false)
    expect(clips.some((c) => c.trackId === 'overlay' && c.label.includes('sfx'))).toBe(false)
    expect(tracks.some((t) => t.id === 'sfx')).toBe(true)
  })
})

describe('insertBrollAt', () => {
  it('adds a B-Roll track clip without text overlay content', () => {
    insertBrollAt('broll_insert', 'B-roll insert', 3, 4)
    const { clips, tracks } = useTimelineStore.getState()
    const clip = clips.find((c) => c.trackId === 'broll')
    expect(clip?.effects?.visualType).toBe('broll_overlay')
    expect(clip?.effects?.overlayMode).toBe('fullscreen')
    expect(clip?.effects?.displayValue).toBe('')
    expect(clip?.label).toBe('B-Roll')
    expect(tracks.some((t) => t.id === 'broll')).toBe(true)
  })
})

describe('migrateBrollClipsToTrack', () => {
  it('moves screen_recording overlays to the B-Roll track', () => {
    const clips: Clip[] = [{
      id: 'legacy-broll',
      trackId: 'overlay',
      startTime: 2,
      duration: 3,
      label: 'Screen recording',
      type: 'overlay',
      effects: {
        visualType: 'screen_recording',
        displayValue: 'Screen recording — add your demo clip',
        overlayMode: 'fullscreen',
      },
    }]
    const { clips: next, tracks } = migrateBrollClipsToTrack(INITIAL_TRACKS, clips)
    expect(next[0].trackId).toBe('broll')
    expect(next[0].effects?.visualType).toBe('broll_overlay')
    expect(next[0].effects?.displayValue).toBe('')
    expect(next[0].label).toBe('B-Roll')
    expect(tracks.some((t) => t.id === 'broll')).toBe(true)
  })
})

describe('migrateSfxClipsToLanes', () => {
  it('moves legacy effects-track SFX onto dedicated lanes', () => {
    const clips: Clip[] = [{
      id: 'legacy',
      trackId: 'effects',
      startTime: 1,
      duration: 0.3,
      label: 'Add your whoosh sound',
      type: 'effect',
      effects: { sfxType: 'whoosh' },
    }]
    const { clips: next, tracks } = migrateSfxClipsToLanes(INITIAL_TRACKS, clips)
    expect(next[0].trackId).toBe('sfx')
    expect(next[0].type).toBe('audio')
    expect(tracks.some((t) => t.id === 'sfx')).toBe(true)
  })
})
