import { describe, it, expect } from 'vitest'
import {
  computeFitPixelsPerSecond,
  PPS_MIN,
  PPS_MAX,
} from '@/stores/timelineStore'

describe('computeFitPixelsPerSecond', () => {
  it('fits 60s into 900px viewport', () => {
    const pps = computeFitPixelsPerSecond(900, 60)
    expect(pps).toBeGreaterThan(PPS_MIN)
    expect(pps * 60).toBeLessThanOrEqual(900 - 112 - 120 + 1)
  })

  it('clamps to PPS_MIN for very long timelines', () => {
    expect(computeFitPixelsPerSecond(800, 3600)).toBe(PPS_MIN)
  })

  it('clamps to PPS_MAX for very short timelines', () => {
    expect(computeFitPixelsPerSecond(2000, 1)).toBe(PPS_MAX)
  })
})
