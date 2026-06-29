'use client'

import { useEffect, useState } from 'react'
import { listTemplates, type ClonedTemplate } from '@/lib/templates'

interface TemplateGalleryProps {
  onSelect: (template: ClonedTemplate) => void
}

export function TemplateGallery({ onSelect }: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<ClonedTemplate[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      const res = await listTemplates()
      if (res.error) {
        setError(res.error)
      } else {
        setTemplates(res.data ?? [])
      }
      setLoading(false)
    })()
  }, [])

  if (loading) {
    return <p className="text-xs text-text-secondary p-3">Loading templates…</p>
  }

  if (error) {
    return (
      <p className="text-xs text-status-error p-3" role="alert">
        {error}
      </p>
    )
  }

  if (templates.length === 0) {
    return (
      <p className="text-xs text-text-disabled p-3">
        No cloned templates yet. Import a reference video to clone its style.
      </p>
    )
  }

  return (
    <div
      data-testid="template-gallery"
      className="grid grid-cols-2 gap-2 p-3 overflow-y-auto"
    >
      {templates.map((t) => {
        const data = t.data
        const clipSlots =
          data?.layers?.filter((l) => l.type === 'video_placeholder') ?? []
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t)}
            className="border border-bg-overlay rounded-lg p-2 text-left
                       hover:border-accent transition-colors bg-bg-elevated"
          >
            <div
              className="aspect-[9/16] bg-bg-overlay rounded mb-2 flex items-center
                         justify-center text-[10px] text-text-disabled"
            >
              {data?.aspect_ratio ?? '9:16'}
            </div>
            <p className="text-xs font-medium text-text-primary truncate">{t.name}</p>
            <p className="text-[10px] text-text-secondary">
              {data?.visual_style ?? 'style'} · {Math.round(data?.duration ?? 0)}s
            </p>
            <div className="flex gap-1 mt-1 flex-wrap">
              {clipSlots.map((l, i) => (
                <span
                  key={`${t.id}-${l.slot ?? i}`}
                  className="text-[9px] bg-bg-overlay px-1 py-0.5 rounded"
                >
                  {l.label || `Clip ${i + 1}`}
                </span>
              ))}
            </div>
          </button>
        )
      })}
    </div>
  )
}
