'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ReferenceInput } from '@/components/editor/ReferenceInput'
import { TemplateGapResolver } from '@/components/editor/TemplateGapResolver'
import { StepIndicator } from '@/components/oneclick/StepIndicator'
import { useJobPoller } from '@/hooks/useJobPoller'
import { matchTemplateToLibrary, type AnnotatedTemplate } from '@/lib/gapResolutionApi'
import { downloadRemoteFile } from '@/lib/downloadFile'
import {
  getTemplateRenderJob,
  startRenderFromTemplate,
} from '@/lib/renderTemplateApi'
import type { StyleTemplateV2 } from '@/lib/styleIntelligenceApi'

type Step = 'reference' | 'resolve' | 'text' | 'review' | 'done'

interface CloneStyleFlowProps {
  projectId: string
}

export function CloneStyleFlow({ projectId }: CloneStyleFlowProps) {
  const [step, setStep] = useState<Step>('reference')
  const [template, setTemplate] = useState<AnnotatedTemplate | null>(null)
  const [resolvedAssets, setResolvedAssets] = useState<
    Record<string, { storageKey: string; url: string }>
  >({})
  const [textValues, setTextValues] = useState<Record<string, string>>({})
  const [renderJobId, setRenderJobId] = useState<string | null>(null)
  const [finalVideo, setFinalVideo] = useState<{ url: string; captionNote?: string } | null>(null)

  const { status: renderStatus, error: renderError } = useJobPoller(
    renderJobId,
    (jobResult) => {
      const url = (jobResult as { url?: string }).url
      if (url) {
        setFinalVideo({
          url,
          captionNote: (jobResult as { caption_note?: string }).caption_note,
        })
        setStep('done')
      }
    },
    { fetchJob: getTemplateRenderJob },
  )

  const textSlots = useMemo(
    () => template?.slots.filter((slot) => slot.type === 'text_overlay') ?? [],
    [template],
  )

  const mediaSlots = useMemo(
    () =>
      template?.slots.filter(
        (slot) => slot.type === 'video_placeholder' || slot.type === 'image_placeholder',
      ) ?? [],
    [template],
  )

  const allSlotsResolved = useMemo(() => {
    if (!mediaSlots.length) return false
    return mediaSlots.every((slot) => {
      const status = slot.match?.status
      if (status === 'missing') return false
      return Boolean(resolvedAssets[slot.slot_id]?.storageKey || slot.match?.storage_key)
    })
  }, [mediaSlots, resolvedAssets])

  useEffect(() => {
    if (!template) return
    const seeded: Record<string, { storageKey: string; url: string }> = {}
    for (const slot of mediaSlots) {
      const key = slot.match?.storage_key
      if (key && slot.match?.status && slot.match.status !== 'missing') {
        seeded[slot.slot_id] = { storageKey: key, url: '' }
      }
    }
    setResolvedAssets((prev) => ({ ...seeded, ...prev }))
  }, [template, mediaSlots])

  const handleTemplateReady = async (rawTemplate: StyleTemplateV2) => {
    const { data, error } = await matchTemplateToLibrary(rawTemplate)
    if (error || !data) {
      toast.error(error ?? 'Could not match your library to this style.')
      return
    }
    setTemplate(data)
    setStep('resolve')
  }

  const handleSlotResolved = useCallback(
    (slotId: string, assetId: string, storageKey: string, url: string) => {
      setResolvedAssets((prev) => ({ ...prev, [slotId]: { storageKey, url } }))
      setTemplate((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          slots: prev.slots.map((slot) =>
            slot.slot_id === slotId
              ? {
                  ...slot,
                  match: {
                    status: 'matched',
                    asset_id: assetId,
                    score: 1,
                    storage_key: storageKey,
                  },
                }
              : slot,
          ),
        }
      })
    },
    [],
  )

  const startRender = useCallback(async () => {
    if (!template) return
    setFinalVideo(null)
    const { data, error } = await startRenderFromTemplate({
      projectId,
      template,
      resolvedAssets,
      textValues,
    })
    if (error || !data) {
      toast.error(error ?? 'Could not start rendering. Please try again.')
      return
    }
    setRenderJobId(data.job_id)
    setStep('review')
  }, [projectId, resolvedAssets, template, textValues])

  const handleDownload = useCallback(async () => {
    if (!finalVideo?.url) return
    const dl = await downloadRemoteFile(finalVideo.url, 'my-video.mp4')
    if (!dl.ok) toast.error(dl.error ?? 'Could not download video.')
  }, [finalVideo?.url])

  const handleContinueFromResolve = () => {
    if (textSlots.length) {
      setStep('text')
      return
    }
    void startRender()
  }

  const isRendering = renderStatus === 'queued' || renderStatus === 'processing'

  return (
    <div className="max-w-2xl mx-auto py-8 px-4" data-testid="clone-style-flow">
      <div className="mb-6">
        <StepIndicator current={step} />
      </div>

      {step === 'reference' && (
        <ReferenceInput projectId={projectId} onTemplateReady={handleTemplateReady} />
      )}

      {template?.director_notes && template.director_notes.length > 0 && step !== 'reference' && (
        <details className="mb-4 rounded-xl border border-border bg-bg-surface px-4 py-3">
          <summary className="text-xs font-medium text-text-secondary cursor-pointer">
            How this style works
          </summary>
          <ul className="mt-2 space-y-1.5 text-xs text-text-disabled list-disc pl-4">
            {template.director_notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>
      )}

      {step === 'resolve' && template && (
        <>
          <TemplateGapResolver
            template={template}
            onTemplateChange={setTemplate}
            onSlotResolved={handleSlotResolved}
          />
          <button
            type="button"
            data-testid="clone-style-continue-btn"
            onClick={handleContinueFromResolve}
            disabled={!allSlotsResolved}
            className="w-full mt-4 bg-accent text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {allSlotsResolved
              ? textSlots.length
                ? 'Continue'
                : 'Make my video'
              : 'Resolve all clips to continue'}
          </button>
        </>
      )}

      {step === 'text' && (
        <div className="space-y-4">
          <h2 className="font-semibold text-sm text-text-primary">Add your text</h2>
          <p className="text-xs text-text-secondary">
            Text styling comes from the reference video automatically — just type your words.
          </p>
          {textSlots.map((slot) => (
            <div key={slot.slot_id}>
              <label className="text-xs text-text-disabled mb-1 block">{slot.label}</label>
              <input
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-bg-surface text-text-primary"
                placeholder={`Enter ${slot.label.toLowerCase()}...`}
                value={textValues[slot.slot_id] ?? ''}
                onChange={(e) =>
                  setTextValues((prev) => ({ ...prev, [slot.slot_id]: e.target.value }))
                }
              />
            </div>
          ))}
          <button
            type="button"
            data-testid="make-my-video-btn"
            onClick={() => void startRender()}
            className="w-full bg-accent text-white py-3 rounded-xl text-sm font-medium"
          >
            Make my video
          </button>
        </div>
      )}

      {step === 'review' && !finalVideo && (
        <div className="text-center py-10 space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-accent mx-auto" />
          <p className="text-sm text-text-secondary">Putting your video together...</p>
          {renderError && <p className="text-xs text-status-error">{renderError}</p>}
          {!isRendering && renderError && (
            <button
              type="button"
              onClick={() => void startRender()}
              className="text-xs text-accent underline"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {step === 'done' && finalVideo && (
        <div className="text-center py-8 space-y-4" data-testid="clone-style-done">
          <video
            src={finalVideo.url}
            className="mx-auto rounded-xl"
            style={{ maxWidth: 280, aspectRatio: '9/16' }}
            controls
            autoPlay
            playsInline
          />
          {finalVideo.captionNote && (
            <p className="text-xs text-text-secondary max-w-sm mx-auto">{finalVideo.captionNote}</p>
          )}
          <button
            type="button"
            onClick={() => void handleDownload()}
            className="inline-block bg-bg-overlay text-text-primary py-2.5 px-6 rounded-xl text-sm font-medium"
          >
            Download
          </button>
          <div className="flex flex-wrap gap-3 justify-center pt-2 text-xs">
            <Link href={`/projects/${projectId}/shorts`} className="text-accent hover:underline">
              Also get this as Shorts
            </Link>
            <Link href={`/projects/${projectId}/trailer`} className="text-accent hover:underline">
              Also make a trailer
            </Link>
            <Link href={`/editor/${projectId}`} className="text-accent hover:underline">
              Add captions in editor
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
