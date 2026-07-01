'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useJobPoller } from '@/hooks/useJobPoller'
import {
  getStyleIntelligenceJob,
  startStyleAnalysis,
  type StyleTemplateV2,
} from '@/lib/styleIntelligenceApi'

interface ReferenceInputProps {
  projectId: string
  onTemplateReady: (template: StyleTemplateV2) => void
}

const STEP_LABELS: Record<string, string> = {
  downloading_reference: 'Downloading the video you shared...',
  analyzing_with_gemini: 'Studying the style — pacing, captions, cuts...',
  done: 'Template ready!',
}

export function ReferenceInput({ projectId, onTemplateReady }: ReferenceInputProps) {
  const [url, setUrl] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)

  const { status, result, error } = useJobPoller(
    jobId,
    (jobResult) => {
      const template = (jobResult as { template?: StyleTemplateV2 }).template
      if (template) {
        onTemplateReady(template)
        toast.success('Style template extracted — slots are ready for matching')
      }
    },
    {
      fetchJob: getStyleIntelligenceJob,
    }
  )

  const step =
    (result as { step?: string } | null)?.step ?? 'analyzing_with_gemini'

  const analyze = async () => {
    const trimmed = url.trim()
    if (!trimmed) return

    const { data, error: apiError } = await startStyleAnalysis(projectId, { url: trimmed })
    if (apiError || !data) {
      toast.error(apiError ?? 'Could not start style analysis. Please try again.')
      return
    }
    setJobId(data.job_id)
  }

  const isWorking = status === 'queued' || status === 'processing'

  return (
    <div
      className="border-t border-bg-overlay px-4 py-4 space-y-3"
      data-testid="reference-input"
    >
      <div className="flex gap-2">
        <input
          type="url"
          className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-bg-surface
                     text-text-primary placeholder:text-text-disabled"
          placeholder="https://www.tiktok.com/@..."
          value={url}
          disabled={isWorking}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void analyze()
          }}
        />
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={!url.trim() || isWorking}
          className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium
                     disabled:opacity-50 shrink-0"
        >
          {isWorking ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              Analyzing
            </span>
          ) : (
            'Analyze'
          )}
        </button>
      </div>

      {isWorking && (
        <p className="text-xs text-accent animate-pulse">
          {STEP_LABELS[step] ?? 'Working...'}
        </p>
      )}

      {error && (
        <p className="text-xs text-status-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
