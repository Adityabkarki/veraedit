'use client'

/**
 * TemplateCard — single visual template preview tile.
 *
 * Shows a 16:9 preview with the template's background colour + a
 * simulated text overlay. Language toggle switches between English
 * and Nepali text (Nepali uses font-nepali/Noto Sans Devanagari).
 *
 * Clicking "Insert" adds the template at the current playhead time.
 * The card is also draggable (HTML5 drag, drops on the timeline lane).
 */

import { useCallback } from 'react'
import { useVisualLibraryStore }  from '@/stores/visualLibraryStore'
import { useTimelineStore }       from '@/stores/timelineStore'
import type { VisualTemplate, ContentLanguage } from '@/stores/visualLibraryStore'

interface TemplateCardProps {
  template:  VisualTemplate
  language:  ContentLanguage
}

export function TemplateCard({ template, language }: TemplateCardProps) {
  const { insertTemplate, brandKit, brandApplied } = useVisualLibraryStore()
  const { playheadTime } = useTimelineStore()

  const displayText = language === 'ne' ? template.textNe : template.textEn
  const previewBg   = brandApplied ? brandKit.secondaryColor : template.previewBg
  const textColor   = brandApplied ? brandKit.primaryColor   : template.previewAccent

  const handleInsert = useCallback(() => {
    insertTemplate(template.id, playheadTime)
  }, [template.id, playheadTime, insertTemplate])

  // HTML5 drag — data transferred to Timeline's drop handler
  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({
      type:       'visual-template',
      templateId: template.id,
    }))
    e.dataTransfer.effectAllowed = 'copy'
  }, [template.id])

  return (
    <div
      data-testid={`template-card-${template.id}`}
      className="group flex flex-col gap-1.5"
    >
      {/* Preview tile */}
      <div
        draggable
        onDragStart={handleDragStart}
        data-testid={`template-preview-${template.id}`}
        className="relative rounded-lg overflow-hidden cursor-grab active:cursor-grabbing
                   border-2 border-transparent group-hover:border-accent transition-colors"
        style={{ aspectRatio: '16/9', background: previewBg }}
      >
        {/* Simulated overlay text */}
        <div className="absolute inset-x-2 bottom-2 flex flex-col gap-0.5">
          <div
            className={[
              'text-[7px] font-semibold px-1.5 py-0.5 rounded truncate',
              template.style === 'bold'      ? 'bg-white'         :
              template.style === 'minimal'   ? 'bg-black/50 border border-white/20' :
              template.style === 'corporate' ? 'bg-blue-900/70'   :
              'bg-gradient-to-r from-purple-600 to-pink-500',
              language === 'ne' ? 'font-nepali' : '',
            ].join(' ')}
            style={{ color: template.style === 'bold' ? '#111' : textColor }}
          >
            {displayText.split('\n')[0].slice(0, 20)}
          </div>
        </div>

        {/* Category badge */}
        <div
          className="absolute top-1.5 left-1.5 text-[8px] px-1 py-0.5 rounded
                     bg-black/50 text-white/70 capitalize"
        >
          {template.category}
        </div>

        {/* Nepali indicator */}
        {language === 'ne' && (
          <div
            data-testid={`nepali-indicator-${template.id}`}
            className="absolute top-1.5 right-1.5 text-[8px]"
          >
            🇳🇵
          </div>
        )}

        {/* Duration chip */}
        <div className="absolute bottom-1.5 right-1.5 text-[8px] font-mono text-white/60 bg-black/40 px-1 rounded">
          {template.defaultDuration}s
        </div>

        {/* Hover overlay with Insert button */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
          <button
            data-testid={`insert-template-${template.id}`}
            onClick={handleInsert}
            className="px-2.5 py-1 rounded-lg bg-accent text-white text-[10px] font-medium
                       hover:bg-accent-glow transition-colors"
            aria-label={`Insert ${template.name} at playhead`}
          >
            + Insert
          </button>
        </div>
      </div>

      {/* Label */}
      <p className="text-[11px] text-text-secondary group-hover:text-text-primary transition-colors text-center leading-tight">
        {language === 'ne' ? template.nameNe : template.name}
      </p>
    </div>
  )
}
