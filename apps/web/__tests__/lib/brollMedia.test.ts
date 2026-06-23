/**
 * Tests for lib/brollMedia.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  activeBrollClipAt,
  attachUrlToBrollClip,
  isLikelyImageUrl,
  mediaKindFromUrl,
} from '@/lib/brollMedia'
import { insertBrollAt } from '@/lib/mediaClips'
import { useTimelineStore, INITIAL_CLIPS } from '@/stores/timelineStore'

beforeEach(() => {
  useTimelineStore.setState({
    clips: INITIAL_CLIPS.map((c) => ({ ...c })),
    selectedClipIds: [],
    playheadTime: 0,
    undoStack: [],
    redoStack: [],
    lastEditAction: null,
  })
})

describe('activeBrollClipAt', () => {
  it('finds b-roll clip at playhead time', () => {
    insertBrollAt('broll_insert', 'B-roll', 5, 3)
    const clip = activeBrollClipAt(useTimelineStore.getState().clips, 6)
    expect(clip?.trackId).toBe('broll')
  })
})

describe('attachUrlToBrollClip', () => {
  it('sets mediaUrl on the b-roll clip', () => {
    insertBrollAt('broll_insert', 'B-roll', 2, 2)
    const id = useTimelineStore.getState().clips.find((c) => c.trackId === 'broll')!.id
    const ok = attachUrlToBrollClip(id, 'https://example.com/clip.mp4')
    expect(ok).toBe(true)
    const updated = useTimelineStore.getState().clips.find((c) => c.id === id)
    expect(updated?.effects?.mediaUrl).toContain('example.com')
    expect(updated?.effects?.isPlaceholder).toBe(false)
  })

  it('rejects invalid URLs', () => {
    insertBrollAt('broll_insert', 'B-roll', 2, 2)
    const id = useTimelineStore.getState().clips.find((c) => c.trackId === 'broll')!.id
    expect(attachUrlToBrollClip(id, 'not-a-url')).toBe(false)
  })
})

describe('media helpers', () => {
  it('detects image URLs', () => {
    expect(isLikelyImageUrl('https://x.com/a.png')).toBe(true)
    expect(mediaKindFromUrl('https://x.com/a.jpg')).toBe('image')
    expect(mediaKindFromUrl('https://x.com/vid')).toBe('video')
  })
})
