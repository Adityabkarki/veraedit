'use client'

import { useEffect, useRef, useState } from 'react'
import {
  PIPELINE_POLL_MS,
  pollEditorPipeline,
  type PipelinePollState,
} from '@/lib/pipelineStatus'
import { loadEditorProject } from '@/lib/editorData'
import type { AssetStatus } from '@/stores/assetStore'

const INITIAL: PipelinePollState = {
  phase: 'idle',
  assetStatus: null,
  errorMessage: null,
  transcriptReady: false,
  detailMessage: null,
  elapsedMs: 0,
  progressPercent: 0,
}

/**
 * Poll backend while asset is processing; reload full editor data when done or errored.
 */
export function useEditorPipelinePoll(projectId: string) {
  const [pipeline, setPipeline] = useState<PipelinePollState>(INITIAL)
  const startedRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!projectId) {
      setPipeline(INITIAL)
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null
    startedRef.current = Date.now()

    async function tick() {
      const state = await pollEditorPipeline(projectId, startedRef.current)
      if (cancelled) return
      setPipeline(state)

      if (state.phase === 'error' || state.phase === 'done') {
        if (timer) clearInterval(timer)
        await loadEditorProject(projectId, { reloadTimeline: true })
      }
    }

    void tick()
    timer = setInterval(() => { void tick() }, PIPELINE_POLL_MS)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [projectId])

  return pipeline
}

export function shouldPollAssetStatus(status: AssetStatus | null | undefined): boolean {
  if (!status) return false
  return ['uploaded', 'transcribing', 'analyzing'].includes(status)
}
