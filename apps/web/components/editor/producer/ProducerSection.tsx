'use client'

/**
 * ProducerSection — reusable collapsible section shell for the AI Producer.
 *
 * States:
 *   idle        → shows a [Generate] button
 *   generating  → shows a spinner + "Generating…" label
 *   done        → renders `children` (the generated result) + Regenerate
 *
 * The Generate button calls generateSection() then, after a short delay,
 * completeSection(). Tests can drive the store directly for determinism.
 */

import { useCallback } from 'react'
import { useProducerStore } from '@/stores/producerStore'
import type { ProducerSection as SectionKey } from '@/stores/producerStore'

interface ProducerSectionProps {
  sectionKey: SectionKey
  title:      string
  icon:       string
  /** Rendered only when status === 'done' */
  children:   React.ReactNode
}

const GENERATE_DELAY_MS = 600

export function ProducerSection({ sectionKey, title, icon, children }: ProducerSectionProps) {
  const { status, generateSection, completeSection } = useProducerStore()
  const sectionStatus = status[sectionKey]

  const handleGenerate = useCallback(() => {
    generateSection(sectionKey)
    setTimeout(() => completeSection(sectionKey), GENERATE_DELAY_MS)
  }, [sectionKey, generateSection, completeSection])

  return (
    <div
      data-testid={`producer-section-${sectionKey}`}
      className="border-b border-bg-overlay"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none" aria-hidden="true">{icon}</span>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        </div>

        {sectionStatus === 'done' && (
          <button
            data-testid={`regenerate-${sectionKey}`}
            onClick={handleGenerate}
            aria-label={`Regenerate ${title}`}
            title="Regenerate"
            className="text-[11px] text-text-disabled hover:text-accent transition-colors"
          >
            ↻ Regenerate
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-3 pb-3">
        {sectionStatus === 'idle' && (
          <button
            data-testid={`generate-${sectionKey}`}
            onClick={handleGenerate}
            className="w-full py-2 rounded-lg border border-dashed border-bg-overlay
                       text-xs text-text-secondary hover:text-text-primary
                       hover:border-accent/40 transition-colors"
          >
            ✨ Generate {title.toLowerCase()}
          </button>
        )}

        {sectionStatus === 'generating' && (
          <div
            data-testid={`generating-${sectionKey}`}
            className="flex items-center justify-center gap-2 py-3 text-xs text-text-secondary"
          >
            <span className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Generating…
          </div>
        )}

        {sectionStatus === 'done' && (
          <div data-testid={`result-${sectionKey}`} className="animate-fade-in">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
