/**
 * Tests for lib/captionEffects.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  insertCaptionEffectAt,
  isCaptionEffectClip,
  migrateCaptionEffectClips,
  resolveCaptionEffectAt,
} from '@/lib/captionEffects'
import { useTimelineStore, INITIAL_CLIPS } from '@/stores/timelineStore'

beforeEach(() => {
  useTimelineStore.setState({
    clips: INITIAL_CLIPS.map((c) => ({ ...c })),
    selectedClipIds: [],
    playheadTime: 1,
    undoStack: [],
    redoStack: [],
    lastEditAction: null,
  })
})

describe('insertCaptionEffectAt', () => {
  it('places effect on caption-fx and spans the caption at playhead', () => {
    insertCaptionEffectAt('caption_word_by_word', 'Word-by-word', 1)
    const fx = useTimelineStore.getState().clips.find((c) => c.trackId === 'caption-fx')
    expect(fx?.effects?.captionAnimation).toBe('word-by-word')
    expect(fx?.startTime).toBe(0.5)
    expect(fx?.duration).toBe(3)
  })
})

describe('resolveCaptionEffectAt', () => {
  it('returns active FX config at playhead time', () => {
    insertCaptionEffectAt('caption_scale_pop', 'Scale-pop', 4)
    const resolved = resolveCaptionEffectAt(useTimelineStore.getState().clips, 5)
    expect(resolved?.config.animation).toBe('scale_pop')
  })
})

describe('migrateCaptionEffectClips', () => {
  it('moves legacy animation clips off the captions text track', () => {
    const clips = [
      ...INITIAL_CLIPS,
      {
        id: 'legacy-cap-fx',
        trackId: 'captions',
        startTime: 2,
        duration: 3,
        label: 'Pop-in captions',
        type: 'caption' as const,
        effects: { animation: 'pop' },
      },
    ]
    const { clips: next } = migrateCaptionEffectClips(
      useTimelineStore.getState().tracks,
      clips,
    )
    const migrated = next.find((c) => c.id === 'legacy-cap-fx')
    expect(migrated?.trackId).toBe('caption-fx')
    expect(migrated?.effects?.captionAnimation).toBe('pop')
    expect(isCaptionEffectClip(migrated)).toBe(true)
  })
})
