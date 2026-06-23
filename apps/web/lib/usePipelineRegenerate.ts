'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { loadEditorProject } from '@/lib/editorData'
import {
  fetchPipelineCosts,
  parseRegenerateError,
  regenerateShorts,
  regenerateTranscript,
  runChapterAnalysis,
  type PipelineCostsResponse,
} from '@/lib/pipelineApi'

export function usePipelineRegenerate(projectId: string | undefined, assetId: string | undefined) {
  const [loading, setLoading] = useState(false)
  const [costs, setCosts] = useState<PipelineCostsResponse | null>(null)

  const loadCosts = useCallback(async () => {
    if (!projectId || !assetId) return null
    const res = await fetchPipelineCosts(projectId, assetId)
    if (res.data) setCosts(res.data)
    return res.data
  }, [projectId, assetId])

  const refreshEditor = useCallback(async () => {
    if (projectId) {
      await loadEditorProject(projectId, { reloadTimeline: false })
    }
  }, [projectId])

  const runTranscript = useCallback(
    async (confirmation?: string, resume = true) => {
      if (!projectId || !assetId) return { ok: false as const }
      setLoading(true)
      const res = await regenerateTranscript(projectId, assetId, { confirmation, resume })
      setLoading(false)
      if (res.error) {
        const detail = parseRegenerateError(res.error)
        if (detail?.requires_confirmation) {
          return { ok: false as const, needsConfirm: true, detail }
        }
        toast.error(res.error)
        return { ok: false as const }
      }
      toast.success(res.data?.message ?? 'Transcription started.')
      void refreshEditor()
      return { ok: true as const }
    },
    [projectId, assetId, refreshEditor],
  )

  const runChapters = useCallback(
    async (confirmation?: string) => {
      if (!projectId || !assetId) return { ok: false as const }
      setLoading(true)
      const res = await runChapterAnalysis(projectId, assetId, { confirmation })
      setLoading(false)
      if (res.error) {
        const detail = parseRegenerateError(res.error)
        if (detail?.requires_confirmation) {
          return { ok: false as const, needsConfirm: true, detail }
        }
        toast.error(res.error)
        return { ok: false as const }
      }
      toast.success(res.data?.message ?? 'Chapter analysis started.')
      void refreshEditor()
      return { ok: true as const }
    },
    [projectId, assetId, refreshEditor],
  )

  const runShorts = useCallback(
    async (confirmation?: string) => {
      if (!projectId || !assetId) return { ok: false as const }
      setLoading(true)
      const res = await regenerateShorts(projectId, assetId, { confirmation })
      setLoading(false)
      if (res.error) {
        const detail = parseRegenerateError(res.error)
        if (detail?.requires_confirmation) {
          return { ok: false as const, needsConfirm: true, detail }
        }
        toast.error(res.error)
        return { ok: false as const }
      }
      toast.success(res.data?.message ?? 'Shorts regeneration started.')
      void refreshEditor()
      return { ok: true as const }
    },
    [projectId, assetId, refreshEditor],
  )

  return {
    loading,
    costs,
    loadCosts,
    runTranscript,
    runChapters,
    runShorts,
  }
}
