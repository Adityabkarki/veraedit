'use client'

/**
 * CaptionStylePicker — FFmpeg burn-in style presets (Module 03).
 *
 * Five backend styles: hormozi, mrbeast, minimal, nepali_bold, kinetic.
 * Used when exporting captioned video via POST /captions/render.
 */

import { useState } from 'react'
import {
  BURN_IN_STYLES,
  type BurnInStyle,
  startCaptionRender,
  getCaptionJob,
} from '@/lib/captionsApi'
import { useCaptionsStore } from '@/stores/captionsStore'
import { useAssetStore } from '@/stores/assetStore'
import { toast } from 'sonner'

interface CaptionStylePickerProps {
  projectId?: string
}

export function CaptionStylePicker({ projectId }: CaptionStylePickerProps) {
  const [selected, setSelected] = useState<BurnInStyle>('nepali_bold')
  const [rendering, setRendering] = useState(false)
  const captions = useCaptionsStore((s) => s.captions)
  const asset = useAssetStore((s) => s.asset)

  const handleBurnIn = async () => {
    if (!projectId) {
      toast.error('Save the project before burning captions into video.')
      return
    }
    if (!asset?.storageKey) {
      toast.error('Upload a video first to burn captions into it.')
      return
    }
    if (captions.length === 0) {
      toast.error('No captions to render. Transcribe or add captions first.')
      return
    }

    const words = captions.flatMap((cap) => {
      const parts = cap.text.trim().split(/\s+/).filter(Boolean)
      if (parts.length === 0) return []
      const step = cap.duration / parts.length
      return parts.map((word, i) => ({
        word,
        start: cap.startTime + i * step,
        end: cap.startTime + (i + 1) * step,
      }))
    })

    setRendering(true)
    const res = await startCaptionRender(
      projectId,
      asset.storageKey,
      words,
      selected
    )
    if (res.error || !res.data?.job_id) {
      toast.error(res.error ?? 'Could not start caption render.')
      setRendering(false)
      return
    }

    const jobId = res.data.job_id
    toast.message('Rendering captions…', { description: 'This may take a minute.' })

    const poll = async (attempt = 0): Promise<void> => {
      if (attempt > 60) {
        toast.error('Caption render timed out. Check the worker is running.')
        setRendering(false)
        return
      }
      const status = await getCaptionJob(jobId)
      if (status.error) {
        toast.error(status.error)
        setRendering(false)
        return
      }
      const st = status.data?.status
      if (st === 'done' && status.data?.result?.url) {
        toast.success('Captions burned into video.', {
          description: 'Download link is ready.',
          action: {
            label: 'Open',
            onClick: () => window.open(status.data!.result!.url!, '_blank'),
          },
        })
        setRendering(false)
        return
      }
      if (st === 'failed') {
        toast.error(status.data?.error ?? 'Caption render failed.')
        setRendering(false)
        return
      }
      setTimeout(() => void poll(attempt + 1), 2000)
    }

    void poll()
  }

  return (
    <div data-testid="caption-style-picker" className="px-3 py-3 border-b border-bg-overlay">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled mb-2">
        Burn-in style (export)
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {BURN_IN_STYLES.map((style) => {
          const active = selected === style.id
          return (
            <button
              key={style.id}
              type="button"
              data-testid={`burn-style-${style.id}`}
              onClick={() => setSelected(style.id)}
              aria-pressed={active}
              title={style.description}
              className={[
                'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                active
                  ? 'bg-accent text-white'
                  : 'bg-bg-overlay text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
              ].join(' ')}
            >
              {style.id === 'nepali_bold' && <span className="text-[10px]">🇳🇵</span>}
              {style.label}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        data-testid="burn-captions-btn"
        disabled={rendering}
        onClick={() => void handleBurnIn()}
        className="w-full py-1.5 rounded-lg text-xs font-medium bg-accent text-white
                   hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {rendering ? 'Rendering…' : 'Burn captions into video'}
      </button>
    </div>
  )
}
