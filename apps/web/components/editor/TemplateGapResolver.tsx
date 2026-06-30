'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { uploadLibraryAsset } from '@/lib/assetLibraryApi'
import {
  generateSlotAsset,
  type AnnotatedSlot,
  type AnnotatedTemplate,
  type SlotMatchStatus,
} from '@/lib/gapResolutionApi'

interface TemplateGapResolverProps {
  template: AnnotatedTemplate
  onTemplateChange: (template: AnnotatedTemplate) => void
  onSlotResolved: (
    slotId: string,
    assetId: string,
    storageKey: string,
    url: string,
    isGenerated: boolean
  ) => void
}

const STATUS_CONFIG: Record<
  SlotMatchStatus,
  { border: string; icon: string; label: string }
> = {
  matched: {
    border: 'border-status-success/40 bg-status-success/10',
    icon: '✓',
    label: 'Matched from your library',
  },
  partial: {
    border: 'border-status-warning/40 bg-status-warning/10',
    icon: '~',
    label: 'Best available match — review or replace',
  },
  missing: {
    border: 'border-status-error/40 bg-status-error/10',
    icon: '!',
    label: 'Nothing available — generate or upload',
  },
}

export function TemplateGapResolver({
  template,
  onTemplateChange,
  onSlotResolved,
}: TemplateGapResolverProps) {
  const [generating, setGenerating] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)

  const slotsNeedingAssets = template.slots.filter(
    (slot) => slot.type === 'video_placeholder' || slot.type === 'image_placeholder'
  )

  const updateSlotMatch = (slotId: string, match: AnnotatedSlot['match']) => {
    onTemplateChange({
      ...template,
      slots: template.slots.map((slot) =>
        slot.slot_id === slotId ? { ...slot, match } : slot
      ),
    })
  }

  const generateForSlot = async (slot: AnnotatedSlot) => {
    setGenerating(slot.slot_id)
    const { data, error } = await generateSlotAsset({
      slotType: slot.type as 'video_placeholder' | 'image_placeholder',
      requirementDescription: slot.requirement?.description || slot.label,
      aspectRatio: template.aspect_ratio,
    })
    if (error || !data) {
      toast.error(error ?? 'Could not generate this clip. Please try again.')
      setGenerating(null)
      return
    }

    updateSlotMatch(slot.slot_id, {
      status: 'matched',
      asset_id: data.asset_id,
      score: 1,
      storage_key: data.storage_key,
    })
    onSlotResolved(
      slot.slot_id,
      data.asset_id,
      data.storage_key,
      data.url,
      data.is_generated_standin
    )
    if (data.is_generated_standin) {
      toast.info('AI-generated stand-in added — you can swap in real footage later.')
    }
    setGenerating(null)
  }

  const uploadForSlot = async (slot: AnnotatedSlot, file: File) => {
    setUploading(slot.slot_id)
    const { data, error } = await uploadLibraryAsset(file)
    if (error || !data) {
      toast.error(error ?? 'Upload failed. Please try again.')
      setUploading(null)
      return
    }

    updateSlotMatch(slot.slot_id, {
      status: 'matched',
      asset_id: data.id,
      score: 1,
      storage_key: data.storage_key,
    })
    onSlotResolved(slot.slot_id, data.id, data.storage_key, '', false)
    toast.success('Your clip was added to the library and matched to this slot.')
    setUploading(null)
  }

  const acceptPartial = (slot: AnnotatedSlot) => {
    if (!slot.match) return
    updateSlotMatch(slot.slot_id, { ...slot.match, status: 'matched' })
    toast.success('Partial match accepted for this slot.')
  }

  const missingCount = slotsNeedingAssets.filter((s) => s.match?.status === 'missing').length
  const partialCount = slotsNeedingAssets.filter((s) => s.match?.status === 'partial').length
  const generatedCount = slotsNeedingAssets.filter(
    (s) => s.match?.status === 'matched' && s.match.score === 1
  ).length

  return (
    <div className="space-y-3 p-4 border-t border-bg-overlay" data-testid="template-gap-resolver">
      {(missingCount > 0 || partialCount > 0) && (
        <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 text-sm text-text-primary">
          {missingCount > 0 && (
            <p>
              {missingCount} clip{missingCount !== 1 ? 's' : ''} need to be generated or uploaded.
            </p>
          )}
          {partialCount > 0 && (
            <p>
              {partialCount} clip{partialCount !== 1 ? 's' : ''} use a best-effort match — review them.
            </p>
          )}
        </div>
      )}

      {generatedCount > 0 && (
        <p className="text-xs text-text-secondary">
          {generatedCount} slot{generatedCount !== 1 ? 's' : ''} filled with AI-generated stand-ins
          (flagged in your library as ai_generated).
        </p>
      )}

      {slotsNeedingAssets.map((slot) => {
        const status = (slot.match?.status ?? 'missing') as SlotMatchStatus
        const config = STATUS_CONFIG[status]
        const isBusy = generating === slot.slot_id || uploading === slot.slot_id

        return (
          <div
            key={slot.slot_id}
            className={`border-2 rounded-xl p-4 ${config.border}`}
            data-testid={`gap-slot-${slot.slot_id}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg" aria-hidden>
                    {config.icon}
                  </span>
                  <p className="font-medium text-sm text-text-primary">{slot.label}</p>
                </div>
                <p className="text-xs text-text-secondary mb-1">{config.label}</p>
                {slot.requirement?.description && (
                  <p className="text-xs text-text-disabled italic line-clamp-2">
                    &ldquo;{slot.requirement.description}&rdquo;
                  </p>
                )}
                {status === 'partial' && slot.match && (
                  <p className="text-xs text-status-warning mt-1">
                    Match confidence: {Math.round(slot.match.score * 100)}%
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5 flex-shrink-0">
                {status !== 'matched' && (
                  <button
                    type="button"
                    onClick={() => void generateForSlot(slot)}
                    disabled={isBusy}
                    className="flex items-center justify-center gap-1.5 bg-accent text-white text-xs px-3 py-2 rounded-lg disabled:opacity-50"
                  >
                    {generating === slot.slot_id ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
                        Generating...
                      </>
                    ) : (
                      'Generate with AI'
                    )}
                  </button>
                )}
                <label className="text-xs border border-border px-3 py-2 rounded-lg text-center cursor-pointer hover:bg-bg-overlay text-text-secondary">
                  {uploading === slot.slot_id ? 'Uploading...' : 'Upload my own'}
                  <input
                    type="file"
                    accept="video/*,image/*"
                    className="hidden"
                    disabled={isBusy}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void uploadForSlot(slot, file)
                      e.target.value = ''
                    }}
                  />
                </label>
                {status === 'partial' && (
                  <button
                    type="button"
                    onClick={() => acceptPartial(slot)}
                    className="text-xs text-text-secondary underline"
                  >
                    Keep this match
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
