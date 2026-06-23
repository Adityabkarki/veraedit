import { describe, it, expect } from 'vitest'
import { activeVideoLayout, layoutEffectLabel } from '@/lib/videoLayout'
import type { Clip } from '@/stores/timelineStore'

describe('videoLayout', () => {
  it('resolves split screen from effects track', () => {
    const clips: Clip[] = [
      {
        id: 'fx1',
        trackId: 'effects',
        startTime: 0,
        duration: 4,
        label: 'Split',
        type: 'effect',
        effects: { effectType: 'layout', layout: 'split_screen' },
      },
    ]
    expect(activeVideoLayout(clips, 1).mode).toBe('split_screen')
  })

  it('returns normal when no layout clip', () => {
    expect(activeVideoLayout([], 0).mode).toBe('normal')
  })

  it('labels layout tools clearly', () => {
    expect(layoutEffectLabel('split_screen')).toContain('Split screen')
    expect(layoutEffectLabel('picture_in_picture')).toContain('Picture-in-picture')
  })
})
