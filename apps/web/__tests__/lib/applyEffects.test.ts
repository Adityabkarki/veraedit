/**
 * Tests for lib/applyEffects.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  applyEffectToTimeline,
  resolveTargetClipIds,
  resolveVideoClipForTransition,
  clipPreviewFilter,
  clipPlaybackMultiplier,
  activeVideoClipAt,
} from '@/lib/applyEffects'
import { useTimelineStore, INITIAL_CLIPS } from '@/stores/timelineStore'
import { useEffectsStore } from '@/stores/effectsStore'

beforeEach(() => {
  useTimelineStore.setState({
    clips: INITIAL_CLIPS.map((c) => ({ ...c })),
    selectedClipIds: [],
    playheadTime: 1,
    undoStack: [],
    redoStack: [],
    lastEditAction: null,
  })
  useEffectsStore.setState({
    isOpen: false,
    activeTab: 'filters',
    searchQuery: '',
    recentlyUsed: [],
    lastApplied: null,
    effectRangeIn: null,
    effectRangeOut: null,
    editingEffectClipId: null,
  })
})

describe('resolveTargetClipIds', () => {
  it('uses selected video clip when present', () => {
    useTimelineStore.setState({ selectedClipIds: ['v2'] })
    const ids = resolveTargetClipIds(
      useTimelineStore.getState().clips,
      ['v2'],
      0,
      ['video'],
    )
    expect(ids).toEqual(['v2'])
  })

  it('falls back to clip at playhead', () => {
    const ids = resolveTargetClipIds(
      useTimelineStore.getState().clips,
      [],
      1,
      ['video'],
    )
    expect(ids).toEqual(['v1'])
  })
})

describe('applyEffectToTimeline — filters', () => {
  it('creates keyframed filter clip on Effects track', () => {
    useTimelineStore.setState({ selectedClipIds: ['v1'] })
    const result = applyEffectToTimeline('warm', 'filters')
    expect(result.ok).toBe(true)
    const fx = useTimelineStore.getState().clips.find((c) => c.trackId === 'effects')
    expect(fx?.type).toBe('effect')
    expect(fx?.effects?.effectType).toBe('filter')
    expect(fx?.effects?.colorFilterCss).toContain('sepia')
    expect(fx?.effects?.keyframes).toHaveLength(2)
    expect(useTimelineStore.getState().lastEditAction).toContain('Warm')
  })

  it('uses selected clip timing when a clip is selected', () => {
    useTimelineStore.setState({ selectedClipIds: ['v2'], playheadTime: 2 })
    applyEffectToTimeline('bw', 'filters')
    const fx = useTimelineStore.getState().clips.find((c) => c.trackId === 'effects')
    expect(fx?.startTime).toBe(7)
    expect(fx?.duration).toBeCloseTo(4)
  })
})

describe('resolveVideoClipForTransition', () => {
  it('targets the clip whose out point is nearest when dropped on a cut', () => {
    const clips = useTimelineStore.getState().clips
    const ids = resolveVideoClipForTransition(clips, [], 6)
    expect(ids).toEqual(['v1'])
  })
})

describe('applyEffectToTimeline — transitions', () => {
  it('stores transition on clip', () => {
    useTimelineStore.setState({ selectedClipIds: ['v2'], playheadTime: 10.5 })
    const result = applyEffectToTimeline('dissolve', 'transitions')
    expect(result.ok).toBe(true)
    const clip = useTimelineStore.getState().clips.find((c) => c.id === 'v2')
    expect(clip?.effects?.transitionOut).toBe('dissolve')
    expect(clip?.effects?.transitionDuration).toBe(0.5)
  })

  it('splits a long clip at the playhead when placing a transition', () => {
    useTimelineStore.setState({
      clips: [
        {
          id: 'long',
          trackId: 'video',
          startTime: 0,
          duration: 120,
          label: 'Long take',
          type: 'video',
        },
      ],
      playheadTime: 9,
      selectedClipIds: [],
    })
    applyEffectToTimeline('dissolve', 'transitions')
    const clips = useTimelineStore.getState().clips.filter((c) => c.trackId === 'video')
    expect(clips).toHaveLength(2)
    const left = clips.find((c) => Math.abs(c.startTime + c.duration - 9) < 0.05)
    expect(left?.effects?.transitionOut).toBe('dissolve')
  })
})

describe('applyEffectToTimeline — speed', () => {
  it('creates keyframed speed clip on Effects track', () => {
    useTimelineStore.setState({ selectedClipIds: ['v1'] })
    const result = applyEffectToTimeline('fast-2x', 'speed')
    expect(result.ok).toBe(true)
    const fx = useTimelineStore.getState().clips.find((c) => c.trackId === 'effects')
    expect(fx?.effects?.effectType).toBe('speed')
    expect(fx?.effects?.keyframes?.[1]?.value).toBe(2)
  })
})

describe('applyEffectToTimeline — text', () => {
  it('inserts overlay clip at playhead', () => {
    useTimelineStore.setState({ playheadTime: 5 })
    const before = useTimelineStore.getState().clips.length
    const result = applyEffectToTimeline('lt-bold', 'text')
    expect(result.ok).toBe(true)
    expect(useTimelineStore.getState().clips.length).toBe(before + 1)
    const overlay = useTimelineStore.getState().clips.find(
      (c) => c.trackId === 'overlay' && c.startTime === 5,
    )
    expect(overlay?.effects?.visualType).toBe('key_term')
  })
})

describe('preview helpers', () => {
  it('activeVideoClipAt finds clip under time', () => {
    const clip = activeVideoClipAt(useTimelineStore.getState().clips, 8)
    expect(clip?.id).toBe('v2')
  })

  it('clipPreviewFilter uses keyframed effect at time', () => {
    useTimelineStore.setState({ selectedClipIds: ['v1'] })
    applyEffectToTimeline('bw', 'filters')
    const clips = useTimelineStore.getState().clips
    const video = clips.find((c) => c.id === 'v1')
    const filter = clipPreviewFilter(video, clips, 1)
    expect(filter).toContain('grayscale')
  })

  it('clipPlaybackMultiplier uses clip speed', () => {
    const clip = { ...INITIAL_CLIPS[0], speed: 2 }
    expect(clipPlaybackMultiplier(clip)).toBe(2)
  })
})
