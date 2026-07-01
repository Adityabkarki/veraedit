'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useJobPoller } from '@/hooks/useJobPoller'
import { useScenesStore, type ApiScene } from '@/stores/scenesStore'
import { downloadRemoteFile } from '@/lib/downloadFile'
import {
  getChapterExtractJob,
  startChapterExtraction,
  type ChapterClip,
} from '@/lib/chaptersApi'

const STEP_LABELS: Record<string, string> = {
  downloading: 'Loading your video...',
  transcribing: 'Listening to what is said...',
  detecting_chapters: 'Finding natural chapter breaks...',
  cutting_chapter: 'Cutting and captioning chapters...',
}

interface ChapterExtractorProps {
  videoKey: string
  projectId: string
}

export function ChapterExtractor({ videoKey, projectId }: ChapterExtractorProps) {
  const [jobId, setJobId] = useState<string | null>(null)
  const [chapters, setChapters] = useState<ChapterClip[] | null>(null)

  const { status, result, error } = useJobPoller(
    jobId,
    (jobResult) => {
      const list = (jobResult as { chapters?: ChapterClip[] }).chapters
      if (list) {
        setChapters(list)
        const apiScenes: ApiScene[] = list.map((ch, i) => ({
          id: `chapter_${ch.index}`,
          index: i,
          start_time: ch.start,
          end_time: ch.end,
          title: ch.title,
          summary: ch.summary ?? ch.title,
          thumbnail_url: null,
        }))
        const existing = useScenesStore.getState().scenes
        if (existing.length === 0) {
          useScenesStore.getState().loadFromApi(apiScenes)
        }
      }
    },
    { fetchJob: getChapterExtractJob },
  )

  const step = (result as { step?: string; done?: number; total?: number } | null)?.step
  const done = (result as { done?: number } | null)?.done
  const total = (result as { total?: number } | null)?.total
  const isWorking = status === 'queued' || status === 'processing'

  const start = async () => {
    setChapters(null)
    const { data, error: apiError } = await startChapterExtraction({
      projectId,
      videoKey,
    })
    if (apiError || !data) {
      toast.error(apiError ?? 'Could not start chapter extraction. Please try again.')
      return
    }
    setJobId(data.job_id)
  }

  const downloadAll = async () => {
    if (!chapters?.length) return
    for (const [i, ch] of chapters.entries()) {
      const filename = `chapter_${i + 1}_${ch.title.replace(/\s+/g, '_')}.mp4`
      const dl = await downloadRemoteFile(ch.url, filename)
      if (!dl.ok) {
        toast.error(dl.error ?? 'Could not download chapter.')
        return
      }
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  const downloadOne = async (ch: ChapterClip, index: number) => {
    const filename = `chapter_${index + 1}_${ch.title.replace(/\s+/g, '_')}.mp4`
    const dl = await downloadRemoteFile(ch.url, filename)
    if (!dl.ok) toast.error(dl.error ?? 'Could not download chapter.')
  }

  const stepLabel =
    step === 'cutting_chapter' && total
      ? `Cutting chapter ${(done ?? 0) + 1} of ${total}...`
      : STEP_LABELS[step ?? ''] ?? 'Working...'

  return (
    <div className="border-b border-bg-overlay px-3 py-4 space-y-4" data-testid="chapter-extractor">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">Export standalone chapters</h2>
        <p className="text-xs text-text-secondary mt-1 leading-snug">
          Split your long video into captioned chapter clips you can publish separately.
        </p>
      </div>

      <button
        type="button"
        data-testid="extract-chapters-btn"
        onClick={() => void start()}
        disabled={isWorking}
        className="w-full py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isWorking ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {stepLabel}
          </>
        ) : (
          'Extract chapters'
        )}
      </button>

      {error && <p className="text-xs text-status-error">{error}</p>}

      {chapters && chapters.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-secondary">{chapters.length} chapters ready</p>
            <button
              type="button"
              onClick={() => void downloadAll()}
              className="text-xs text-accent hover:underline"
            >
              Download all
            </button>
          </div>
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {chapters.map((ch) => (
              <li
                key={ch.index}
                data-testid={`chapter-clip-${ch.index}`}
                className="flex items-start justify-between gap-2 p-2 rounded bg-bg-overlay text-xs"
              >
                <div className="min-w-0">
                  <p className="font-medium text-text-primary truncate">{ch.title}</p>
                  <p className="text-text-disabled">{Math.round(ch.duration)}s</p>
                </div>
                <button
                  type="button"
                  onClick={() => void downloadOne(ch, ch.index)}
                  className="text-accent hover:underline flex-shrink-0"
                >
                  Download
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
