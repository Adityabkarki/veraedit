/**
 * Fetch downsampled waveform peaks from AudioAnalysisTrack sidecar (Phase 15).
 */
import { api } from '@/lib/api'

export interface WaveformPeaksResponse {
  peaks: number[]
  fps: number
  frameCount: number
  sourceHash?: string
}

export async function fetchProjectWaveformPeaks(
  projectId: string,
  barCount = 500,
): Promise<WaveformPeaksResponse | null> {
  const res = await api.get<WaveformPeaksResponse>(
    `/projects/${projectId}/audio-analysis/waveform?barCount=${barCount}`,
  )
  return res.data ?? null
}
