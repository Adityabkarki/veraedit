'use client'

import { Sparkles, Eraser, ZoomIn, Wand2, Palette } from 'lucide-react'
import { SectionWrapper } from '@/components/editor/properties/shared/SectionWrapper'
import { useCallback, useState } from 'react'
import { api } from '@/lib/api'
import { removeBackgroundFromImageClip } from '@/lib/imageMedia'
import type { BackgroundRemovalProgress } from '@/lib/backgroundRemoval'

interface AIToolsSectionProps {
  clipId: string
  imageSrc: string
  storageKey: string
  projectId: string
  onJobStarted: (jobId: string, label: string) => void
}

interface CloudAIAction {
  icon: React.ReactNode
  label: string
  description: string
  endpoint: string
  buildPayload: (storageKey: string, projectId: string) => object
}

const CLOUD_AI_ACTIONS: CloudAIAction[] = [
  {
    icon: <ZoomIn size={13} />,
    label: 'Upscale & enhance',
    description: 'Sharpen and increase resolution',
    endpoint: '/enhance/run',
    buildPayload: (storageKey, projectId) => ({
      video_key: storageKey,
      project_id: projectId,
      operations: ['color'],
    }),
  },
  {
    icon: <Palette size={13} />,
    label: 'Auto color correct',
    description: 'Match exposure & white balance',
    endpoint: '/enhance/run',
    buildPayload: (storageKey, projectId) => ({
      video_key: storageKey,
      project_id: projectId,
      operations: ['color'],
    }),
  },
  {
    icon: <Wand2 size={13} />,
    label: 'Regenerate with AI',
    description: 'Replace with AI-generated image',
    endpoint: '/imagegen/generate',
    buildPayload: (_storageKey, projectId) => ({
      prompt: 'Professional high quality image',
      project_id: projectId,
    }),
  },
]

export function AIToolsSection({
  clipId,
  imageSrc,
  storageKey,
  projectId,
  onJobStarted,
}: AIToolsSectionProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bgProgress, setBgProgress] = useState<BackgroundRemovalProgress | null>(null)

  const runBackgroundRemoval = useCallback(async () => {
    setLoading('Remove background')
    setError(null)
    setBgProgress({ phase: 'loading-model', message: 'Starting…', percent: 0 })

    try {
      await removeBackgroundFromImageClip(clipId, setBgProgress)
      setBgProgress(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Background removal failed.')
      setBgProgress(null)
    } finally {
      setLoading(null)
    }
  }, [clipId])

  const runCloudAction = async (action: CloudAIAction) => {
    setLoading(action.label)
    setError(null)
    try {
      const res = await api.post<{ job_id?: string }>(
        action.endpoint,
        action.buildPayload(storageKey, projectId),
      )
      if (res.error || !res.data?.job_id) {
        setError(res.error ?? 'Could not start AI job. Try again later.')
        return
      }
      onJobStarted(res.data.job_id, action.label)
    } catch {
      setError('Could not reach the server. Make sure the API is running.')
    } finally {
      setLoading(null)
    }
  }

  const bgDisabled = loading !== null || !imageSrc

  return (
    <SectionWrapper title="AI tools" icon={<Sparkles size={14} />} defaultOpen={false}>
      {error && (
        <p className="text-[10px] text-status-error" role="alert">
          {error}
        </p>
      )}

      {bgProgress && (
        <div
          data-testid="image-bg-removal-progress"
          className="rounded-lg border border-bg-overlay bg-bg-overlay/30 px-3 py-2 space-y-1.5"
        >
          <p className="text-[10px] text-text-secondary">{bgProgress.message}</p>
          <div className="h-1 rounded-full bg-bg-overlay overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-150"
              style={{ width: `${bgProgress.percent}%` }}
            />
          </div>
          <p className="text-[10px] text-text-disabled tabular-nums">{bgProgress.percent}%</p>
        </div>
      )}

      <div className="space-y-1.5">
        <button
          type="button"
          data-testid="image-ai-remove-background"
          onClick={runBackgroundRemoval}
          disabled={bgDisabled}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-bg-overlay
                     text-left hover:bg-bg-overlay/50 transition-colors disabled:opacity-50"
        >
          <span className="text-text-secondary flex-shrink-0">
            <Eraser size={13} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary">Remove background</p>
            <p className="text-[10px] text-text-disabled">
              Runs locally in your browser — free, private, transparent PNG
            </p>
          </div>
          {loading === 'Remove background' && (
            <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
          )}
        </button>

        {CLOUD_AI_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            data-testid={`image-ai-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
            onClick={() => runCloudAction(action)}
            disabled={loading !== null}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-bg-overlay
                       text-left hover:bg-bg-overlay/50 transition-colors disabled:opacity-50"
          >
            <span className="text-text-secondary flex-shrink-0">{action.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text-primary">{action.label}</p>
              <p className="text-[10px] text-text-disabled">{action.description}</p>
            </div>
            {loading === action.label && (
              <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
          </button>
        ))}
      </div>

      {!imageSrc && (
        <p className="text-[10px] text-text-disabled">
          Upload or link an image first to use AI tools.
        </p>
      )}
    </SectionWrapper>
  )
}
