/**
 * Tests for stores/timelineStore.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  useTimelineStore,
  INITIAL_TRACKS,
  INITIAL_CLIPS,
  PPS_DEFAULT,
  PPS_MIN,
  PPS_MAX,
  CLIP_MIN_DURATION,
} from '@/stores/timelineStore'

beforeEach(() => {
  localStorage.clear()
  useTimelineStore.getState().resetTimeline()
  useTimelineStore.getState().loadDemoData()
  useTimelineStore.setState({ snapEnabled: true, pixelsPerSecond: PPS_DEFAULT })
})

// ── Initial state ─────────────────────────────────────────────────────────────

describe('timelineStore — initial state', () => {
  it('starts with empty clips before demo data is loaded', () => {
    useTimelineStore.getState().resetTimeline()
    expect(useTimelineStore.getState().clips).toHaveLength(0)
  })

  it('loads INITIAL_TRACKS (5 tracks)', () => {
    expect(useTimelineStore.getState().tracks).toHaveLength(6)
  })

  it('loads INITIAL_CLIPS (8 clips) via loadDemoData', () => {
    expect(useTimelineStore.getState().clips).toHaveLength(8)
  })

  it('starts at PPS_DEFAULT', () => {
    expect(useTimelineStore.getState().pixelsPerSecond).toBe(PPS_DEFAULT)
  })

  it('playheadTime starts at 0', () => {
    expect(useTimelineStore.getState().playheadTime).toBe(0)
  })

  it('snap is enabled by default', () => {
    expect(useTimelineStore.getState().snapEnabled).toBe(true)
  })

  it('no clips selected initially', () => {
    expect(useTimelineStore.getState().selectedClipIds).toHaveLength(0)
  })

  it('undoStack is empty initially', () => {
    expect(useTimelineStore.getState().undoStack).toHaveLength(0)
  })
})

// ── Playhead ──────────────────────────────────────────────────────────────────

describe('timelineStore — setPlayheadTime', () => {
  it('sets playhead to a positive value', () => {
    useTimelineStore.getState().setPlayheadTime(5)
    expect(useTimelineStore.getState().playheadTime).toBe(5)
  })

  it('clamps playhead to 0 (no negative time)', () => {
    useTimelineStore.getState().setPlayheadTime(-3)
    expect(useTimelineStore.getState().playheadTime).toBe(0)
  })
})

describe('timelineStore — stepPlayhead', () => {
  it('advances playhead by delta', () => {
    useTimelineStore.getState().setPlayheadTime(10)
    useTimelineStore.getState().stepPlayhead(5)
    expect(useTimelineStore.getState().playheadTime).toBe(15)
  })

  it('rewinds playhead by delta', () => {
    useTimelineStore.getState().setPlayheadTime(10)
    useTimelineStore.getState().stepPlayhead(-5)
    expect(useTimelineStore.getState().playheadTime).toBe(5)
  })

  it('clamps to 0 when stepping before start', () => {
    useTimelineStore.getState().setPlayheadTime(2)
    useTimelineStore.getState().stepPlayhead(-5)
    expect(useTimelineStore.getState().playheadTime).toBe(0)
  })
})

// ── Zoom ──────────────────────────────────────────────────────────────────────

describe('timelineStore — zoom', () => {
  it('setPixelsPerSecond sets value within bounds', () => {
    useTimelineStore.getState().setPixelsPerSecond(160)
    expect(useTimelineStore.getState().pixelsPerSecond).toBe(160)
  })

  it('setPixelsPerSecond clamps to PPS_MIN', () => {
    useTimelineStore.getState().setPixelsPerSecond(1)
    expect(useTimelineStore.getState().pixelsPerSecond).toBe(PPS_MIN)
  })

  it('setPixelsPerSecond clamps to PPS_MAX', () => {
    useTimelineStore.getState().setPixelsPerSecond(9999)
    expect(useTimelineStore.getState().pixelsPerSecond).toBe(PPS_MAX)
  })

  it('zoomIn multiplies pps by 1.5', () => {
    useTimelineStore.getState().setPixelsPerSecond(80)
    useTimelineStore.getState().zoomIn()
    expect(useTimelineStore.getState().pixelsPerSecond).toBe(80 * 1.5)
  })

  it('zoomOut divides pps by 1.5', () => {
    useTimelineStore.getState().setPixelsPerSecond(120)
    useTimelineStore.getState().zoomOut()
    expect(useTimelineStore.getState().pixelsPerSecond).toBeCloseTo(120 / 1.5)
  })

  it('zoomIn is clamped to PPS_MAX', () => {
    useTimelineStore.getState().setPixelsPerSecond(PPS_MAX)
    useTimelineStore.getState().zoomIn()
    expect(useTimelineStore.getState().pixelsPerSecond).toBe(PPS_MAX)
  })
})

// ── Selection ─────────────────────────────────────────────────────────────────

describe('timelineStore — selectClip', () => {
  it('selects a single clip', () => {
    useTimelineStore.getState().selectClip('v1')
    expect(useTimelineStore.getState().selectedClipIds).toContain('v1')
  })

  it('replaces previous selection by default', () => {
    useTimelineStore.getState().selectClip('v1')
    useTimelineStore.getState().selectClip('v2')
    expect(useTimelineStore.getState().selectedClipIds).toEqual(['v2'])
  })

  it('addToSelection appends the clip', () => {
    useTimelineStore.getState().selectClip('v1')
    useTimelineStore.getState().selectClip('v2', true)
    expect(useTimelineStore.getState().selectedClipIds).toContain('v1')
    expect(useTimelineStore.getState().selectedClipIds).toContain('v2')
  })

  it('addToSelection deselects an already-selected clip', () => {
    useTimelineStore.getState().selectClip('v1')
    useTimelineStore.getState().selectClip('v1', true)
    expect(useTimelineStore.getState().selectedClipIds).not.toContain('v1')
  })

  it('selectClip(null) clears selection', () => {
    useTimelineStore.getState().selectClip('v1')
    useTimelineStore.getState().selectClip(null)
    expect(useTimelineStore.getState().selectedClipIds).toHaveLength(0)
  })

  it('clearSelection removes all', () => {
    useTimelineStore.getState().selectClip('v1')
    useTimelineStore.getState().selectClip('v2', true)
    useTimelineStore.getState().clearSelection()
    expect(useTimelineStore.getState().selectedClipIds).toHaveLength(0)
  })
})

// ── moveClip ──────────────────────────────────────────────────────────────────

describe('timelineStore — moveClip', () => {
  it('moves a clip to a new start time', () => {
    useTimelineStore.getState().moveClip('v1', 8)
    const clip = useTimelineStore.getState().clips.find((c) => c.id === 'v1')!
    expect(clip.startTime).toBe(8)
  })

  it('clamps startTime to 0 (cannot go negative)', () => {
    useTimelineStore.getState().moveClip('v1', -3)
    const clip = useTimelineStore.getState().clips.find((c) => c.id === 'v1')!
    expect(clip.startTime).toBe(0)
  })

  it('duration is unchanged after move', () => {
    const original = useTimelineStore.getState().clips.find((c) => c.id === 'v1')!
    useTimelineStore.getState().moveClip('v1', 10)
    const after = useTimelineStore.getState().clips.find((c) => c.id === 'v1')!
    expect(after.duration).toBe(original.duration)
  })

  it('does not affect other clips', () => {
    const v2Before = useTimelineStore.getState().clips.find((c) => c.id === 'v2')!.startTime
    useTimelineStore.getState().moveClip('v1', 10)
    const v2After = useTimelineStore.getState().clips.find((c) => c.id === 'v2')!.startTime
    expect(v2After).toBe(v2Before)
  })
})

// ── trimClipStart ─────────────────────────────────────────────────────────────

describe('timelineStore — trimClipStart', () => {
  it('trims the start of a clip', () => {
    useTimelineStore.getState().trimClipStart('v1', 1, 5) // trim 1s from start
    const clip = useTimelineStore.getState().clips.find((c) => c.id === 'v1')!
    expect(clip.startTime).toBe(1)
    expect(clip.duration).toBe(5)
  })

  it('enforces CLIP_MIN_DURATION', () => {
    useTimelineStore.getState().trimClipStart('v1', 0, 0.01)
    const clip = useTimelineStore.getState().clips.find((c) => c.id === 'v1')!
    expect(clip.duration).toBe(CLIP_MIN_DURATION)
  })

  it('clamps startTime to 0', () => {
    useTimelineStore.getState().trimClipStart('v1', -1, 7)
    const clip = useTimelineStore.getState().clips.find((c) => c.id === 'v1')!
    expect(clip.startTime).toBe(0)
  })
})

// ── trimClipEnd ───────────────────────────────────────────────────────────────

describe('timelineStore — trimClipEnd', () => {
  it('trims the end of a clip', () => {
    useTimelineStore.getState().trimClipEnd('v1', 4)
    const clip = useTimelineStore.getState().clips.find((c) => c.id === 'v1')!
    expect(clip.duration).toBe(4)
  })

  it('enforces CLIP_MIN_DURATION', () => {
    useTimelineStore.getState().trimClipEnd('v1', 0)
    const clip = useTimelineStore.getState().clips.find((c) => c.id === 'v1')!
    expect(clip.duration).toBe(CLIP_MIN_DURATION)
  })

  it('startTime is unchanged', () => {
    const original = useTimelineStore.getState().clips.find((c) => c.id === 'v1')!.startTime
    useTimelineStore.getState().trimClipEnd('v1', 3)
    const after = useTimelineStore.getState().clips.find((c) => c.id === 'v1')!.startTime
    expect(after).toBe(original)
  })
})

// ── splitClip ─────────────────────────────────────────────────────────────────

describe('timelineStore — splitClip', () => {
  it('splits a clip into two at the given time', () => {
    // v1: 0–6s; split at 3s
    const beforeCount = useTimelineStore.getState().clips.length
    useTimelineStore.getState().splitClip('v1', 3)
    const afterClips = useTimelineStore.getState().clips
    expect(afterClips.length).toBe(beforeCount + 1) // removed v1, added two
  })

  it('left clip ends at splitTime', () => {
    useTimelineStore.getState().splitClip('v1', 3)
    const leftClip = useTimelineStore.getState().clips.find(
      (c) => c.startTime === 0 && c.trackId === 'video'
    )!
    expect(leftClip.duration).toBeCloseTo(3)
  })

  it('right clip starts at splitTime', () => {
    useTimelineStore.getState().splitClip('v1', 3)
    const rightClip = useTimelineStore.getState().clips.find(
      (c) => c.startTime === 3 && c.trackId === 'video'
    )!
    expect(rightClip).toBeDefined()
    expect(rightClip.duration).toBeCloseTo(3)
  })

  it('original clip is removed', () => {
    useTimelineStore.getState().splitClip('v1', 3)
    const original = useTimelineStore.getState().clips.find((c) => c.id === 'v1')
    expect(original).toBeUndefined()
  })

  it('does nothing if splitTime is before clip start', () => {
    const before = useTimelineStore.getState().clips.length
    useTimelineStore.getState().splitClip('v1', -1)
    expect(useTimelineStore.getState().clips.length).toBe(before)
  })

  it('does nothing if splitTime is after clip end', () => {
    const before = useTimelineStore.getState().clips.length
    useTimelineStore.getState().splitClip('v1', 999)
    expect(useTimelineStore.getState().clips.length).toBe(before)
  })

  it('pushes to undo stack', () => {
    useTimelineStore.getState().splitClip('v1', 3)
    expect(useTimelineStore.getState().undoStack).toHaveLength(1)
  })

  it('sets lastEditAction to "Split clip"', () => {
    useTimelineStore.getState().splitClip('v1', 3)
    expect(useTimelineStore.getState().lastEditAction).toBe('Split clip')
  })

  it('clears redo stack', () => {
    // Create a redo entry first by doing something then undoing
    useTimelineStore.getState().splitClip('v1', 3)
    useTimelineStore.getState().undo()
    expect(useTimelineStore.getState().redoStack).toHaveLength(1)
    // Now do a new edit
    useTimelineStore.getState().splitClip('v2', 8)
    expect(useTimelineStore.getState().redoStack).toHaveLength(0)
  })
})

// ── deleteSelectedClips ───────────────────────────────────────────────────────

describe('timelineStore — deleteSelectedClips', () => {
  it('removes selected clips', () => {
    useTimelineStore.getState().selectClip('v1')
    const before = useTimelineStore.getState().clips.length
    useTimelineStore.getState().deleteSelectedClips()
    expect(useTimelineStore.getState().clips.length).toBe(before - 1)
    expect(useTimelineStore.getState().clips.find((c) => c.id === 'v1')).toBeUndefined()
  })

  it('clears selection after delete', () => {
    useTimelineStore.getState().selectClip('v1')
    useTimelineStore.getState().deleteSelectedClips()
    expect(useTimelineStore.getState().selectedClipIds).toHaveLength(0)
  })

  it('does nothing if nothing is selected', () => {
    const before = useTimelineStore.getState().clips.length
    useTimelineStore.getState().deleteSelectedClips()
    expect(useTimelineStore.getState().clips.length).toBe(before)
  })

  it('pushes to undo stack', () => {
    useTimelineStore.getState().selectClip('v1')
    useTimelineStore.getState().deleteSelectedClips()
    expect(useTimelineStore.getState().undoStack).toHaveLength(1)
  })

  it('handles multi-clip deletion', () => {
    useTimelineStore.getState().selectClip('v1')
    useTimelineStore.getState().selectClip('v2', true)
    const before = useTimelineStore.getState().clips.length
    useTimelineStore.getState().deleteSelectedClips()
    expect(useTimelineStore.getState().clips.length).toBe(before - 2)
  })
})

// ── duplicateClip ─────────────────────────────────────────────────────────────

describe('timelineStore — duplicateClip', () => {
  it('adds a new clip', () => {
    const before = useTimelineStore.getState().clips.length
    useTimelineStore.getState().duplicateClip('v1')
    expect(useTimelineStore.getState().clips.length).toBe(before + 1)
  })

  it('copy is placed after the original', () => {
    const original = useTimelineStore.getState().clips.find((c) => c.id === 'v1')!
    useTimelineStore.getState().duplicateClip('v1')
    const copy = useTimelineStore.getState().clips.find((c) => c.id !== 'v1' && c.trackId === 'video' && c.startTime > original.startTime + original.duration - 0.2)!
    expect(copy).toBeDefined()
    expect(copy.startTime).toBeGreaterThan(original.startTime)
  })

  it('copy has same duration', () => {
    const original = useTimelineStore.getState().clips.find((c) => c.id === 'v1')!
    useTimelineStore.getState().duplicateClip('v1')
    const allClips = useTimelineStore.getState().clips
    const copy = allClips.find((c) => c.id !== 'v1' && c.trackId === 'video' && c.label.includes('copy'))!
    expect(copy.duration).toBe(original.duration)
  })

  it('pushes to undo stack', () => {
    useTimelineStore.getState().duplicateClip('v1')
    expect(useTimelineStore.getState().undoStack).toHaveLength(1)
  })

  it('selects the new copy', () => {
    useTimelineStore.getState().duplicateClip('v1')
    const ids = useTimelineStore.getState().selectedClipIds
    expect(ids).toHaveLength(1)
    expect(ids[0]).not.toBe('v1')
  })

  it('does nothing for unknown clipId', () => {
    const before = useTimelineStore.getState().clips.length
    useTimelineStore.getState().duplicateClip('does-not-exist')
    expect(useTimelineStore.getState().clips.length).toBe(before)
  })
})

// ── Track controls ────────────────────────────────────────────────────────────

describe('timelineStore — track controls', () => {
  it('toggleMute mutes a track', () => {
    useTimelineStore.getState().toggleMute('video')
    expect(useTimelineStore.getState().tracks.find((t) => t.id === 'video')!.muted).toBe(true)
  })

  it('toggleMute unmutes a muted track', () => {
    useTimelineStore.getState().toggleMute('video')
    useTimelineStore.getState().toggleMute('video')
    expect(useTimelineStore.getState().tracks.find((t) => t.id === 'video')!.muted).toBe(false)
  })

  it('toggleLock locks a track', () => {
    useTimelineStore.getState().toggleLock('audio')
    expect(useTimelineStore.getState().tracks.find((t) => t.id === 'audio')!.locked).toBe(true)
  })

  it('toggleLock unlocks a locked track', () => {
    useTimelineStore.getState().toggleLock('audio')
    useTimelineStore.getState().toggleLock('audio')
    expect(useTimelineStore.getState().tracks.find((t) => t.id === 'audio')!.locked).toBe(false)
  })

  it('toggleVisibility hides a track', () => {
    useTimelineStore.getState().toggleVisibility('captions')
    expect(useTimelineStore.getState().tracks.find((t) => t.id === 'captions')!.visible).toBe(false)
  })

  it('toggleVisibility shows a hidden track', () => {
    useTimelineStore.getState().toggleVisibility('captions')
    useTimelineStore.getState().toggleVisibility('captions')
    expect(useTimelineStore.getState().tracks.find((t) => t.id === 'captions')!.visible).toBe(true)
  })

  it('muting one track does not mute others', () => {
    useTimelineStore.getState().toggleMute('video')
    expect(useTimelineStore.getState().tracks.find((t) => t.id === 'audio')!.muted).toBe(false)
  })
})

// ── Snap ──────────────────────────────────────────────────────────────────────

describe('timelineStore — snap', () => {
  it('toggleSnap disables snap when enabled', () => {
    useTimelineStore.getState().toggleSnap()
    expect(useTimelineStore.getState().snapEnabled).toBe(false)
  })

  it('toggleSnap re-enables snap when disabled', () => {
    useTimelineStore.getState().toggleSnap()
    useTimelineStore.getState().toggleSnap()
    expect(useTimelineStore.getState().snapEnabled).toBe(true)
  })

  it('setSnapIndicatorTime sets the time', () => {
    useTimelineStore.getState().setSnapIndicatorTime(5)
    expect(useTimelineStore.getState().snapIndicatorTime).toBe(5)
  })

  it('setSnapIndicatorTime(null) hides indicator', () => {
    useTimelineStore.getState().setSnapIndicatorTime(5)
    useTimelineStore.getState().setSnapIndicatorTime(null)
    expect(useTimelineStore.getState().snapIndicatorTime).toBeNull()
  })
})

// ── Undo / redo ───────────────────────────────────────────────────────────────

describe('timelineStore — undo / redo', () => {
  it('undo restores previous clip state', () => {
    const original = useTimelineStore.getState().clips.find((c) => c.id === 'v1')!.startTime
    useTimelineStore.getState().splitClip('v1', 3)  // pushes to history
    useTimelineStore.getState().undo()
    const restored = useTimelineStore.getState().clips.find((c) => c.id === 'v1')!.startTime
    expect(restored).toBe(original)
  })

  it('undo clears lastEditAction', () => {
    useTimelineStore.getState().splitClip('v1', 3)
    useTimelineStore.getState().undo()
    expect(useTimelineStore.getState().lastEditAction).toBeNull()
  })

  it('undo does nothing when stack is empty', () => {
    const before = useTimelineStore.getState().clips.length
    useTimelineStore.getState().undo()
    expect(useTimelineStore.getState().clips.length).toBe(before)
  })

  it('redo re-applies the undone action', () => {
    useTimelineStore.getState().splitClip('v1', 3)
    const afterSplit = useTimelineStore.getState().clips.length
    useTimelineStore.getState().undo()
    useTimelineStore.getState().redo()
    expect(useTimelineStore.getState().clips.length).toBe(afterSplit)
  })

  it('redo does nothing when stack is empty', () => {
    const before = useTimelineStore.getState().clips.length
    useTimelineStore.getState().redo()
    expect(useTimelineStore.getState().clips.length).toBe(before)
  })

  it('performing a new edit clears the redo stack', () => {
    useTimelineStore.getState().splitClip('v1', 3)
    useTimelineStore.getState().undo()
    expect(useTimelineStore.getState().redoStack).toHaveLength(1)
    useTimelineStore.getState().deleteSelectedClips() // effectively a no-op but triggers the path
    // deleteSelectedClips with nothing selected doesn't push — use split instead
    useTimelineStore.getState().selectClip('v2')
    useTimelineStore.getState().deleteSelectedClips()
    expect(useTimelineStore.getState().redoStack).toHaveLength(0)
  })

  it('undo/redo chain works across multiple operations', () => {
    useTimelineStore.getState().splitClip('v1', 3) // op1
    useTimelineStore.getState().splitClip('v2', 8) // op2
    expect(useTimelineStore.getState().undoStack).toHaveLength(2)

    useTimelineStore.getState().undo() // revert op2
    expect(useTimelineStore.getState().undoStack).toHaveLength(1)
    expect(useTimelineStore.getState().redoStack).toHaveLength(1)

    useTimelineStore.getState().undo() // revert op1
    expect(useTimelineStore.getState().undoStack).toHaveLength(0)
    expect(useTimelineStore.getState().redoStack).toHaveLength(2)

    useTimelineStore.getState().redo() // re-apply op1
    expect(useTimelineStore.getState().undoStack).toHaveLength(1)
    expect(useTimelineStore.getState().redoStack).toHaveLength(1)
  })
})

// ── beginEdit / endEdit ────────────────────────────────────────────────────────

describe('timelineStore — beginEdit / endEdit', () => {
  it('beginEdit saves a pending snapshot', () => {
    useTimelineStore.getState().beginEdit()
    expect(useTimelineStore.getState()._pendingSnapshot).not.toBeNull()
  })

  it('endEdit pushes snapshot to undo stack', () => {
    useTimelineStore.getState().beginEdit()
    useTimelineStore.getState().moveClip('v1', 10)
    useTimelineStore.getState().endEdit('Moved clip')
    expect(useTimelineStore.getState().undoStack).toHaveLength(1)
  })

  it('endEdit sets lastEditAction', () => {
    useTimelineStore.getState().beginEdit()
    useTimelineStore.getState().endEdit('Moved clip')
    expect(useTimelineStore.getState().lastEditAction).toBe('Moved clip')
  })

  it('endEdit clears _pendingSnapshot', () => {
    useTimelineStore.getState().beginEdit()
    useTimelineStore.getState().endEdit('Moved clip')
    expect(useTimelineStore.getState()._pendingSnapshot).toBeNull()
  })

  it('moveClip during drag does NOT push to undo stack', () => {
    useTimelineStore.getState().beginEdit()
    useTimelineStore.getState().moveClip('v1', 5)
    useTimelineStore.getState().moveClip('v1', 7)
    useTimelineStore.getState().moveClip('v1', 9)
    // undoStack still empty — endEdit not called yet
    expect(useTimelineStore.getState().undoStack).toHaveLength(0)
  })
})

// ── clearLastEditAction ────────────────────────────────────────────────────────

describe('timelineStore — clearLastEditAction', () => {
  it('clears lastEditAction to null', () => {
    useTimelineStore.getState().splitClip('v1', 3)
    useTimelineStore.getState().clearLastEditAction()
    expect(useTimelineStore.getState().lastEditAction).toBeNull()
  })
})
