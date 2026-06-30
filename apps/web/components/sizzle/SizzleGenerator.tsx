'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useJobPoller } from '@/hooks/useJobPoller'
import {
  getSizzleJob,
  MOOD_OPTIONS,
  startSizzleGeneration,
} from '@/lib/sizzleApi'

const DURATION_OPTIONS = [15, 30, 45, 60] as const

const STEP_LABELS: Record<string, string> = {
  downloading: 'Loading your video...',
  transcribing: 'Listening to the whole video...',
  finding_highlights: 'Finding the best moments...',
  assembling: 'Cutting them together...',
  captioning: 'Adding captions...',
  adding_music: 'Adding music...',
}

interface SizzleGeneratorProps {
  videoKey: string
  projectId: string
}

export function SizzleGenerator({ videoKey, projectId }: SizzleGeneratorProps) {
  const [duration, setDuration] = useState<number>(30)
  const [mood, setMood] = useState<string>('upbeat')
  const [jobId, setJobId] = useState<string | null>(null)
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null)

  const { status, result, error } = useJobPoller(
    jobId,
    (jobResult) => {
      const url = (jobResult as { url?: string }).url
      if (url) setTrailerUrl(url)
    },
    { fetchJob: getSizzleJob },
  )

  const step = (result as { step?: string } | null)?.step
  const isWorking = status === 'queued' || status === 'processing'

  const start = async () => {
    setTrailerUrl(null)
    const { data, error: apiError } = await startSizzleGeneration({
      projectId,
      videoKey,
      targetDuration: duration,
      musicMood: mood,
    })
    if (apiError || !data) {
      toast.error(apiError ?? 'Could not start trailer generation. Please try again.')
      return
    }
    setJobId(data.job_id)
  }

  return (
    <div className="border-b border-bg-overlay px-4 py-5 space-y-5" data-testid="sizzle-generator">
      <div>
        <h2 className="text-base font-semibold text-text-primary">Make a highlight trailer</h2>
        <p className="text-sm text-text-secondary mt-1">
          A fast-cut preview of your video&apos;s best moments — perfect for teasing the full episode.
        </p>
      </div>

      <div>
        <p className="text-xs text-text-disabled mb-2">Length</p>
        <div className="flex gap-2">
          {DURATION_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDuration(d)}
              className={[
                'flex-1 py-2 rounded-lg text-sm border transition-colors',
                duration === d
                  ? 'bg-accent text-white border-accent'
                  : 'border-bg-overlay text-text-secondary hover:border-accent/40',
              ].join(' ')}
            >
              {d}s
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-text-disabled mb-2">Mood</p>
        <div className="grid grid-cols-2 gap-2">
          {MOOD_OPTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMood(m.id)}
              className={[
                'py-2 rounded-lg text-sm border transition-colors',
                mood === m.id
                  ? 'bg-accent text-white border-accent'
                  : 'border-bg-overlay text-text-secondary hover:border-accent/40',
              ].join(' ')}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        data-testid="generate-sizzle-btn"
        onClick={() => void start()}
        disabled={isWorking}
        className="w-full py-3 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isWorking ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {STEP_LABELS[step ?? ''] ?? 'Working on it...'}
          </>
        ) : (
          'Generate trailer'
        )}
      </button>

      {error && <p className="text-xs text-status-error">{error}</p>}

      {trailerUrl && (
        <div className="space-y-3">
          <video
            src={trailerUrl}
            className="w-full rounded-xl mx-auto"
            style={{ aspectRatio: '9/16', maxWidth: 280 }}
            controls
            autoPlay
            loop
            playsInline
          />
          <a
            href={trailerUrl}
            download="trailer.mp4"
            className="block text-center bg-bg-overlay text-text-primary py-2.5 rounded-xl text-sm font-medium hover:bg-bg-overlay/80"
          >
            Download trailer
          </a>
        </div>
      )}
    </div>
  )
}
