'use client'

/**
 * TextEditorPanel — connects TextEditor to transcript store + cut API.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { TextEditor } from '@/components/editor/TextEditor'
import { useTranscriptStore } from '@/stores/transcriptStore'
import { usePlayerStore } from '@/stores/playerStore'
import { useAssetStore } from '@/stores/assetStore'
import {
  applyCuts,
  detectFillers,
  detectSilences,
  getCutJob,
  type TextCut,
} from '@/lib/textEditorApi'

interface TextEditorPanelProps {
  projectId?: string
}

export function TextEditorPanel({ projectId }: TextEditorPanelProps) {
  const words = useTranscriptStore((s) => s.words)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const seek = usePlayerStore((s) => s.seek)
  const asset = useAssetStore((s) => s.asset)

  const [fillerCuts, setFillerCuts] = useState<TextCut[]>([])
  const [silenceCuts, setSilenceCuts] = useState<TextCut[]>([])
  const [applying, setApplying] = useState(false)

  const editorWords = useMemo(
    () =>
      words
        .filter((w) => !w.deleted && w.type !== 'silence')
        .map((w) => ({ word: w.text, start: w.startTime, end: w.endTime })),
    [words]
  )

  useEffect(() => {
    if (editorWords.length === 0) return
    void (async () => {
      const res = await detectFillers(editorWords, 'ne')
      if (res.data?.cuts) setFillerCuts(res.data.cuts)
    })()
  }, [editorWords])

  useEffect(() => {
    if (!asset?.storageKey) return
    void (async () => {
      const res = await detectSilences(asset.storageKey)
      if (res.data?.silences) setSilenceCuts(res.data.silences)
    })()
  }, [asset?.storageKey])

  const handleSeek = useCallback(
    (t: number) => {
      seek(t)
    },
    [seek]
  )

  const handleApply = useCallback(
    async (cuts: TextCut[]) => {
      if (!projectId || !asset?.storageKey) {
        toast.error('Upload a video and save the project before applying cuts.')
        return
      }
      setApplying(true)
      const res = await applyCuts(projectId, asset.storageKey, cuts)
      if (res.error || !res.data?.job_id) {
        toast.error(res.error ?? 'Could not start cut job.')
        setApplying(false)
        return
      }

      const jobId = res.data.job_id
      toast.message('Applying cuts to video…')

      const poll = async (attempt = 0): Promise<void> => {
        if (attempt > 90) {
          toast.error('Cut job timed out. Make sure the render worker is running.')
          setApplying(false)
          return
        }
        const status = await getCutJob(jobId)
        if (status.error) {
          toast.error(status.error)
          setApplying(false)
          return
        }
        const st = status.data?.status
        if (st === 'done' && status.data?.result?.url) {
          toast.success('Video cuts applied.', {
            action: {
              label: 'Download',
              onClick: () => window.open(status.data!.result!.url!, '_blank'),
            },
          })
          setApplying(false)
          return
        }
        if (st === 'failed') {
          toast.error(status.data?.error ?? 'Cut job failed.')
          setApplying(false)
          return
        }
        setTimeout(() => void poll(attempt + 1), 2000)
      }

      void poll()
    },
    [projectId, asset?.storageKey]
  )

  return (
    <TextEditor
      words={editorWords}
      currentTime={currentTime}
      fillerCuts={fillerCuts}
      silenceCuts={silenceCuts}
      onSeek={handleSeek}
      onApply={handleApply}
      applying={applying}
    />
  )
}
