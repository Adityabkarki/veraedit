import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearWaveformPeakCache,
  getCachedWaveformPeaks,
  peaksFromAnalysisFrames,
} from '@/lib/editor/waveformPeaks'

describe('waveformPeaks', () => {
  beforeEach(() => {
    clearWaveformPeakCache()
  })

  it('caches peaks per zoom bucket', () => {
    const a = getCachedWaveformPeaks({
      sourceId: 'clip-1',
      duration: 60,
      barCount: 20,
      pixelsPerSecond: 50,
    })
    const b = getCachedWaveformPeaks({
      sourceId: 'clip-1',
      duration: 60,
      barCount: 20,
      pixelsPerSecond: 50,
    })
    expect(a).toBe(b)
  })

  it('derives peaks from analysis frames', () => {
    const frames = Array.from({ length: 100 }, (_, i) => ({
      overallAmplitude: i / 100,
    }))
    const peaks = peaksFromAnalysisFrames(frames, 10)
    expect(peaks).toHaveLength(10)
    expect(peaks[0]?.amplitude).toBe(0)
  })
})
