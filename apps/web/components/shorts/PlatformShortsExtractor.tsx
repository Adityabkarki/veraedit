'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useJobPoller } from '@/hooks/useJobPoller'
import { useShortsStore, type ApiShort } from '@/stores/shortsStore'
import {
  getShortsExtractJob,
  PLATFORM_OPTIONS,
  startShortsExtraction,
  type PlatformClip,
} from '@/lib/platformShortsApi'

const STEP_LABELS: Record<string, string> = {
  downloading: 'Loading your video...',
  transcribing: 'Listening to what is said...',
  finding_and_cutting_moments: 'Finding the best moments...',
  uploading_results: 'Almost ready...',
}

interface PlatformShortsExtractorProps {
  videoKey: string
  projectId: string
}

export function PlatformShortsExtractor({ videoKey, projectId }: PlatformShortsExtractorProps) {
  const [selected, setSelected] = useState<string[]>(['tiktok', 'instagram_reels'])
  const [jobId, setJobId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, PlatformClip[]> | null>(null)

  const { status, result, error } = useJobPoller(
    jobId,
    (jobResult) => {
      const shorts = (jobResult as { shorts?: Record<string, PlatformClip[]> }).shorts
      if (shorts) {
        setResults(shorts)
        const apiShorts: ApiShort[] = Object.values(shorts).flat().map((clip, i) => ({
          id: `short_${Date.now()}_${i}`,
          title: clip.title,
          duration: clip.duration,
          platform_scores: {},
          status: 'pending',
        }))
        const existing = useShortsStore.getState().shorts
        if (existing.length === 0) {
          useShortsStore.getState().loadFromApi(apiShorts)
        }
      }
    },
    { fetchJob: getShortsExtractJob }
  )

  const step = (result as { step?: string } | null)?.step
  const isWorking = status === 'queued' || status === 'processing'

  const start = async () => {
    setResults(null)
    const { data, error: apiError } = await startShortsExtraction({
      projectId,
      videoKey,
      platforms: selected,
    })
    if (apiError || !data) {
      toast.error(apiError ?? 'Could not start shorts extraction. Please try again.')
      return
    }
    setJobId(data.job_id)
  }

  const downloadAll = (platform: string) => {
    results?.[platform]?.forEach((clip, i) => {
      window.setTimeout(() => {
        const anchor = document.createElement('a')
        anchor.href = clip.url
        anchor.download = `${platform}_${clip.title.replace(/\s+/g, '_')}.mp4`
        anchor.click()
      }, i * 300)
    })
  }

  return (
    <div className="border-b border-bg-overlay px-4 py-5 space-y-5" data-testid="platform-shorts-extractor">
      <div>
        <h2 className="text-base font-semibold text-text-primary">Get shorts for your platforms</h2>
        <p className="text-sm text-text-secondary mt-1">
          Pick where you want to post — we size and caption each clip correctly.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PLATFORM_OPTIONS.map((platform) => {
          const active = selected.includes(platform.id)
          return (
            <button
              key={platform.id}
              type="button"
              onClick={() =>
                setSelected((current) =>
                  active ? current.filter((id) => id !== platform.id) : [...current, platform.id]
                )
              }
              className={`flex flex-col items-center gap-1 py-4 rounded-xl border-2 transition-all ${
                active
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-accent/40'
              }`}
            >
              <span className="text-2xl" aria-hidden>
                {platform.icon}
              </span>
              <span className="text-xs font-medium text-text-primary">{platform.label}</span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => void start()}
        disabled={!selected.length || isWorking}
        className="w-full bg-accent text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50"
      >
        {isWorking ? 'Working on it...' : `Get my ${selected.length > 1 ? 'shorts' : 'short'}`}
      </button>

      {isWorking && (
        <div className="text-center space-y-2 py-4">
          <Loader2 className="w-8 h-8 animate-spin text-accent mx-auto" aria-label="Processing" />
          <p className="text-sm text-text-secondary">{STEP_LABELS[step ?? ''] ?? 'Working...'}</p>
        </div>
      )}

      {error && (
        <p className="text-sm text-status-error" role="alert">
          {error}
        </p>
      )}

      {results && (
        <div className="space-y-6">
          {Object.entries(results).map(([platform, clips]) => {
            const meta = PLATFORM_OPTIONS.find((p) => p.id === platform)
            return (
              <div key={platform} className="border border-border rounded-xl p-4 bg-bg-surface">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-sm text-text-primary">
                    {meta?.icon} {meta?.label ?? platform}
                  </h3>
                  <button
                    type="button"
                    onClick={() => downloadAll(platform)}
                    className="text-xs bg-text-primary text-bg-base px-3 py-1.5 rounded-lg"
                  >
                    Download all ({clips.length})
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {clips.map((clip, index) => (
                    <div key={`${platform}-${index}`} className="space-y-1">
                      <video
                        src={clip.url}
                        className="w-full rounded-lg bg-black"
                        style={{ aspectRatio: '9/16' }}
                        controls
                        preload="metadata"
                      />
                      <p className="text-xs text-text-secondary truncate">{clip.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
