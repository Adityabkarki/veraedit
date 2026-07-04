/**
 * Tests for lib/motionMath.ts
 */

import { describe, it, expect } from 'vitest'
import {
  clamp,
  easeOutBack,
  easeOutCubic,
  enterProgress,
  exitProgress,
  elementLocalTime,
  seededRandom,
  springApprox,
} from '@/lib/motionMath'

describe('motionMath', () => {
  it('clamp bounds values', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })

  it('easeOutCubic reaches 1 at t=1', () => {
    expect(easeOutCubic(1)).toBeCloseTo(1, 5)
    expect(easeOutCubic(0)).toBe(0)
  })

  it('elementLocalTime detects active window', () => {
    const inside = elementLocalTime(2.5, 2, 5)
    expect(inside.active).toBe(true)
    expect(inside.local).toBeCloseTo(0.5)

    const outside = elementLocalTime(6, 2, 5)
    expect(outside.active).toBe(false)
  })

  it('enterProgress increases over time', () => {
    const early = enterProgress(0.1, 0.5, 'fade')
    const late = enterProgress(0.4, 0.5, 'fade')
    expect(late).toBeGreaterThan(early)
  })

  it('enterProgress supports chart and map animations', () => {
    expect(enterProgress(0.5, 0.5, 'grow')).toBeCloseTo(1, 5)
    expect(enterProgress(0.25, 0.5, 'grow')).toBeGreaterThan(0)
    expect(enterProgress(1, 0.5, 'drop')).toBe(1)
    expect(enterProgress(1, 0.5, 'spring_in')).toBe(1)
    expect(enterProgress(1, 0.5, 'stroke_draw')).toBe(1)
    expect(enterProgress(1, 0.5, 'reveal')).toBe(1)
  })

  it('easeOutBack overshoots then settles', () => {
    expect(easeOutBack(0.5)).toBeGreaterThan(0.5)
    expect(easeOutBack(1)).toBeCloseTo(1, 5)
    expect(springApprox(15, 30)).toBeGreaterThan(0.5)
    expect(springApprox(0, 30)).toBe(0)
  })

  it('exitProgress fades near end', () => {
    const mid = exitProgress(1.0, 3.0, 0.5, 'fade')
    const end = exitProgress(2.9, 3.0, 0.5, 'fade')
    expect(end).toBeLessThan(mid)
  })

  it('seededRandom is deterministic', () => {
    expect(seededRandom(42, 0)).toBe(seededRandom(42, 0))
    expect(seededRandom(42, 1)).not.toBe(seededRandom(42, 0))
  })
})
