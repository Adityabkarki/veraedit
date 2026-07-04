/**
 * Tests for lib/motionGraphicEdit.ts
 */

import { describe, it, expect } from 'vitest'
import {
  buildMotionGraphicPatch,
  formatAnimationLabel,
  motionGraphicIsFullscreen,
  motionGraphicUsesPosition,
  readMotionProps,
} from '@/lib/motionGraphicEdit'
import type { Clip } from '@/stores/timelineStore'

function mgClip(visualType: string, effects: Record<string, unknown> = {}): Clip {
  return {
    id: 'c1',
    trackId: 'overlay',
    startTime: 0,
    duration: 3,
    label: 'MG',
    type: 'overlay',
    effects: { visualType, ...effects },
  }
}

describe('motionGraphicEdit', () => {
  it('detects positionable vs fullscreen types', () => {
    expect(motionGraphicUsesPosition('animated_title')).toBe(true)
    expect(motionGraphicIsFullscreen('end_card')).toBe(true)
    expect(motionGraphicIsFullscreen('animated_title')).toBe(false)
  })

  it('readMotionProps merges display fields', () => {
    const props = readMotionProps(
      mgClip('animated_title', {
        displayValue: 'Hello',
        motionProps: { fontSize: 64 },
      }),
    )
    expect(props.text).toBe('Hello')
    expect(props.fontSize).toBe(64)
  })

  it('buildMotionGraphicPatch syncs text to motionProps', () => {
    const clip = mgClip('animated_title', { motionProps: { fontSize: 72 } })
    const patch = buildMotionGraphicPatch(clip, { displayValue: 'New hook' })
    expect(patch.displayValue).toBe('New hook')
    expect((patch.motionProps as Record<string, unknown>).text).toBe('New hook')
  })

  it('buildMotionGraphicPatch syncs stat label', () => {
    const clip = mgClip('stat_counter', { motionProps: { value: 500 } })
    const patch = buildMotionGraphicPatch(clip, { secondaryText: 'Views' })
    expect((patch.motionProps as Record<string, unknown>).label).toBe('Views')
  })

  it('formatAnimationLabel humanizes ids', () => {
    expect(formatAnimationLabel('word_pop')).toBe('Word pop')
    expect(formatAnimationLabel('unknown_anim')).toBe('unknown anim')
  })
})
