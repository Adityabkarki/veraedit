'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { fetchProjectWaveformPeaks } from '@/lib/editor/fetchAudioWaveformPeaks'
import type { AnalysisFrameLike } from '@/lib/editor/waveformPeaks'

let cachedProjectId: string | null = null
let cachedFrames: AnalysisFrameLike[] = []

export function useProjectAudioAnalysisFrames(): AnalysisFrameLike[] {
  const params = useParams()
  const projectId = typeof params?.id === 'string' ? params.id : null
  const [frames, setFrames] = useState<AnalysisFrameLike[]>(
    projectId === cachedProjectId ? cachedFrames : [],
  )

  useEffect(() => {
    if (!projectId) {
      setFrames([])
      return
    }
    let cancelled = false
    void fetchProjectWaveformPeaks(projectId, 1200).then((data) => {
      if (cancelled || !data?.peaks?.length) return
      const next = data.peaks.map((overallAmplitude) => ({ overallAmplitude }))
      cachedProjectId = projectId
      cachedFrames = next
      setFrames(next)
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  return frames
}
