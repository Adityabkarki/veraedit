import { describe, it, expect } from 'vitest'
import {
  RULER_HEIGHT_PX,
  TRACK_HEIGHT_PX,
  timelineTracksContentHeightPx,
} from '@/lib/timelineLayout'

describe('timelineTracksContentHeightPx', () => {
  it('includes ruler spacer plus one row per track', () => {
    expect(timelineTracksContentHeightPx(0)).toBe(RULER_HEIGHT_PX)
    expect(timelineTracksContentHeightPx(4)).toBe(RULER_HEIGHT_PX + 4 * TRACK_HEIGHT_PX)
  })
})
