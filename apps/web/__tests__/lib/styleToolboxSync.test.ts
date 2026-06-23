/**
 * Tests for lib/styleToolboxSync.ts — toolbox drag/insert behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { insertStyleToolAt } from '@/lib/styleToolboxSync'
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

describe('insertStyleToolAt — transitions', () => {
  it('applies dissolve to the video clip instead of a text overlay', () => {
    useTimelineStore.setState({ playheadTime: 2 })
    const overlayCountBefore = useTimelineStore.getState().clips.filter(
      (c) => c.trackId === 'overlay',
    ).length

    const id = insertStyleToolAt('dissolve_transition', 'Dissolve transitions', 2)

    const clips = useTimelineStore.getState().clips
    const withDissolve = clips.find((c) => c.effects?.transitionOut === 'dissolve')
    expect(withDissolve?.trackId).toBe('video')
    expect(clips.filter((c) => c.trackId === 'overlay').length).toBe(overlayCountBefore)
    expect(clips.some((c) => c.label === 'Dissolve transitions')).toBe(false)
    expect(withDissolve?.id).toBeTruthy()
    expect(id).toBe(withDissolve?.id ?? null)
  })

  it('maps fade toolbox tool to fade-black transition', () => {
    useTimelineStore.setState({ playheadTime: 10.5 })
    insertStyleToolAt('fade_transition', 'Fade transitions', 10.5)
    const video = useTimelineStore
      .getState()
      .clips.find((c) => c.effects?.transitionOut === 'fade-black')
    expect(video?.trackId).toBe('video')
  })
})

describe('insertStyleToolAt — SFX and B-roll', () => {
  it('routes sfx_on_cut to the SFX audio lane', () => {
    insertStyleToolAt('sfx_on_cut', 'SFX on cut', 4)
    const sfx = useTimelineStore.getState().clips.find((c) => c.effects?.sfxType)
    expect(sfx?.trackId).toBe('sfx')
    expect(sfx?.type).toBe('audio')
    expect(sfx?.label).toMatch(/Whoosh/i)
  })

  it('routes broll_insert to the B-Roll track as a black overlay slot', () => {
    insertStyleToolAt('broll_insert', 'B-roll insert', 6)
    const broll = useTimelineStore.getState().clips.find((c) => c.trackId === 'broll')
    expect(broll?.effects?.visualType).toBe('broll_overlay')
    expect(broll?.effects?.overlayMode).toBe('fullscreen')
    expect(broll?.effects?.displayValue).toBe('')
    expect(broll?.label).toBe('B-Roll')
  })

  it('routes screen_broll_cutaway to B-Roll track (not text screen recording)', () => {
    insertStyleToolAt('screen_broll_cutaway', 'Screen-recording B-roll', 8)
    const broll = useTimelineStore.getState().clips.find((c) => c.trackId === 'broll')
    expect(broll?.effects?.visualType).toBe('broll_overlay')
    expect(broll?.effects?.displayValue).toBe('')
  })
})

describe('insertStyleToolAt — captions, music, pacing', () => {
  it('adds caption_pop on the Caption FX track (not a text overlay)', () => {
    useTimelineStore.setState({ playheadTime: 2 })
    insertStyleToolAt('caption_pop', 'Pop-in captions', 2)
    const fx = useTimelineStore.getState().clips.find((c) => c.effects?.captionAnimation === 'pop')
    expect(fx?.trackId).toBe('caption-fx')
    expect(fx?.type).toBe('effect')
    expect(fx?.effects?.displayValue).toBeUndefined()
    const duplicateTextClip = useTimelineStore
      .getState()
      .clips.find((c) => c.trackId === 'captions' && c.label === 'Pop-in captions')
    expect(duplicateTextClip).toBeUndefined()
  })

  it('adds music_bed on the music track', () => {
    insertStyleToolAt('music_bed', 'Background music', 1)
    const music = useTimelineStore.getState().clips.find((c) => c.effects?.musicBed)
    expect(music?.trackId).toBe('music')
    expect(music?.type).toBe('music')
  })

  it('splits video for jump_cut_pacing at playhead', () => {
    const before = useTimelineStore.getState().clips.filter((c) => c.trackId === 'video').length
    useTimelineStore.setState({ playheadTime: 5 })
    insertStyleToolAt('jump_cut_pacing', 'Jump-cut pacing', 5)
    const after = useTimelineStore.getState().clips.filter((c) => c.trackId === 'video').length
    expect(after).toBe(before + 1)
  })

  it('adds ken_burns on dedicated camera track with keyframes', () => {
    useTimelineStore.setState({ playheadTime: 2 })
    insertStyleToolAt('ken_burns', 'Ken Burns zoom', 2)
    const fx = useTimelineStore.getState().clips.find((c) => c.effects?.effectPresetId === 'ken_burns')
    expect(fx?.trackId).toBe('camera')
    expect(fx?.effects?.keyframes?.length).toBeGreaterThanOrEqual(2)
    expect(fx?.duration).toBeGreaterThan(1)
  })
})

describe('insertStyleToolAt — motion graphics', () => {
  it('inserts data_card with editable defaults (not hard-coded case count)', () => {
    insertStyleToolAt('motion_data_card', 'Data verification card', 3)
    const card = useTimelineStore.getState().clips.find((c) => c.effects?.visualType === 'data_card')
    expect(card?.effects?.displayValue).not.toBe('65,000 CASES')
    expect(card?.effects?.secondaryText).toBeTruthy()
  })

  it('inserts arrow_flow without label text fallback', () => {
    insertStyleToolAt('motion_arrow_flow', 'Directional arrow', 4)
    const arrow = useTimelineStore.getState().clips.find((c) => c.effects?.visualType === 'arrow_flow')
    expect(arrow?.effects?.visualType).toBe('arrow_flow')
    expect(arrow?.effects?.widthPct).toBeGreaterThan(0)
  })

  it('inserts conflict_box as sized frame without required text', () => {
    insertStyleToolAt('motion_conflict_box', 'Conflict highlight box', 5)
    const box = useTimelineStore.getState().clips.find((c) => c.effects?.visualType === 'conflict_box')
    expect(box?.effects?.widthPct).toBeGreaterThan(0)
    expect(box?.effects?.heightPct).toBeGreaterThan(0)
    expect(box?.effects?.displayValue).toBe('')
  })
})
