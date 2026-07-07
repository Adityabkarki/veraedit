/**
 * Cached waveform peaks per zoom level (Phase 15).
 */
export interface AnalysisFrameLike {
  overallAmplitude: number
}

export interface WaveformPeak {
  amplitude: number
}

const peakCache = new Map<string, WaveformPeak[]>()

function cacheKey(
  sourceId: string,
  duration: number,
  barCount: number,
  zoomBucket: number,
): string {
  return `${sourceId}:${Math.round(duration * 10)}:${barCount}:${zoomBucket}`
}

function zoomBucketFromPps(pixelsPerSecond: number): number {
  return Math.round(pixelsPerSecond / 10) * 10
}

export function peaksFromAnalysisFrames(
  frames: AnalysisFrameLike[],
  barCount: number,
): WaveformPeak[] {
  if (frames.length === 0 || barCount <= 0) return []
  const peaks: WaveformPeak[] = []
  const step = Math.max(1, Math.floor(frames.length / barCount))
  for (let i = 0; i < barCount; i += 1) {
    const idx = Math.min(frames.length - 1, i * step)
    peaks.push({ amplitude: frames[idx]?.overallAmplitude ?? 0 })
  }
  return peaks
}

export function getCachedWaveformPeaks(options: {
  sourceId?: string
  duration: number
  barCount: number
  pixelsPerSecond: number
  analysisFrames?: AnalysisFrameLike[]
}): WaveformPeak[] {
  const sourceId = options.sourceId ?? 'seed'
  const bucket = zoomBucketFromPps(options.pixelsPerSecond)
  const key = cacheKey(sourceId, options.duration, options.barCount, bucket)
  const cached = peakCache.get(key)
  if (cached) return cached

  let peaks: WaveformPeak[]
  if (options.analysisFrames?.length) {
    peaks = peaksFromAnalysisFrames(options.analysisFrames, options.barCount)
  } else {
    peaks = generateSeededPeaks(options.duration, options.barCount, bucket)
  }
  peakCache.set(key, peaks)
  return peaks
}

function generateSeededPeaks(
  duration: number,
  barCount: number,
  seed: number,
): WaveformPeak[] {
  let s = Math.floor(duration * 1000) + seed
  const rand = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  return Array.from({ length: barCount }, () => ({
    amplitude: 0.2 + rand() * 0.8,
  }))
}

export function clearWaveformPeakCache(): void {
  peakCache.clear()
}
