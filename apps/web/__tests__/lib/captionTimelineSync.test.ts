/**
 * Tests for lib/captionTimelineSync.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  captionToClip,
  syncCaptionsToTimeline,
  syncCaptionsFromTimeline,
  syncCaptionClipFromTimeline,
  removeCaptionsByClipIds,
} from '@/lib/captionTimelineSync'
import { useTimelineStore, INITIAL_TRACKS } from '@/stores/timelineStore'
import { useCaptionsStore, INITIAL_CAPTIONS } from '@/stores/captionsStore'

beforeEach(() => {
  useTimelineStore.setState({
    tracks: INITIAL_TRACKS.map((t) => ({ ...t })),
    clips: [],
    selectedClipIds: [],
    undoStack: [],
    redoStack: [],
    lastEditAction: null,
  })
  useCaptionsStore.setState({
    captions: [],
    editingId: null,
    selectedId: null,
    searchQuery: '',
    replaceText: '',
    searchMatchIds: [],
  })
})

describe('captionToClip', () => {
  it('maps caption times to clip duration', () => {
    const clip = captionToClip({
      id: 'cap-1',
      index: 1,
      startTime: 2,
      endTime: 5,
      text: 'Hello world',
    })
    expect(clip.trackId).toBe('captions')
    expect(clip.startTime).toBe(2)
    expect(clip.duration).toBe(3)
    expect(clip.effects?.displayValue).toBe('Hello world')
  })
})

describe('syncCaptionsToTimeline', () => {
  it('adds caption clips to the captions track', () => {
    const captions = INITIAL_CAPTIONS.slice(0, 3)
    syncCaptionsToTimeline(captions)
    const { clips } = useTimelineStore.getState()
    const capClips = clips.filter((c) => c.trackId === 'captions')
    expect(capClips).toHaveLength(3)
    expect(capClips[0].label).toContain('नमस्ते')
  })

  it('replaces existing caption clips on re-sync', () => {
    syncCaptionsToTimeline(INITIAL_CAPTIONS.slice(0, 2))
    syncCaptionsToTimeline(INITIAL_CAPTIONS.slice(0, 5))
    expect(useTimelineStore.getState().clips.filter((c) => c.trackId === 'captions')).toHaveLength(5)
  })
})

describe('syncCaptionsFromTimeline', () => {
  it('loads captions store from timeline clips', () => {
    syncCaptionsToTimeline(INITIAL_CAPTIONS.slice(0, 4))
    useCaptionsStore.setState({ captions: [] })
    const ok = syncCaptionsFromTimeline(useTimelineStore.getState().clips)
    expect(ok).toBe(true)
    expect(useCaptionsStore.getState().captions).toHaveLength(4)
  })

  it('returns false when no caption clips', () => {
    expect(syncCaptionsFromTimeline([])).toBe(false)
  })
})

describe('syncCaptionClipFromTimeline', () => {
  it('updates caption times after clip drag', () => {
    useCaptionsStore.setState({
      captions: [{ id: 'cap-x', index: 1, startTime: 0, endTime: 2, text: 'Test' }],
    })
    syncCaptionsToTimeline(useCaptionsStore.getState().captions)
    useTimelineStore.setState({
      clips: useTimelineStore.getState().clips.map((c) =>
        c.id === 'cap-x' ? { ...c, startTime: 5, duration: 3 } : c,
      ),
    })
    syncCaptionClipFromTimeline('cap-x')
    const cap = useCaptionsStore.getState().captions[0]
    expect(cap.startTime).toBe(5)
    expect(cap.endTime).toBe(8)
  })
})

describe('removeCaptionsByClipIds', () => {
  it('removes matching captions from store', () => {
    useCaptionsStore.setState({ captions: INITIAL_CAPTIONS.slice(0, 3) })
    removeCaptionsByClipIds(['cap-02'])
    expect(useCaptionsStore.getState().captions).toHaveLength(2)
    expect(useCaptionsStore.getState().captions[0].index).toBe(1)
  })
})
