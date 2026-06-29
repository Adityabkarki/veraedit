'use client'

import { useState } from 'react'
import { TemplateGallery } from '@/components/editor/TemplateGallery'
import { TemplateFiller } from '@/components/editor/TemplateFiller'
import type { ClonedTemplate } from '@/lib/templates'

export function ClonedTemplatesSection() {
  const [selected, setSelected] = useState<ClonedTemplate | null>(null)

  if (selected?.data?.layers) {
    return (
      <div className="flex flex-col h-full overflow-hidden border-t border-bg-overlay">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-bg-overlay">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="text-xs text-accent hover:underline"
          >
            ← Back
          </button>
          <p className="text-xs font-medium text-text-primary truncate">{selected.name}</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <TemplateFiller
            template={{ layers: selected.data.layers }}
            onFill={() => {
              /* slot values collected for future render step */
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col border-t border-bg-overlay max-h-[45%]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled px-3 pt-2">
        Cloned from video
      </p>
      <TemplateGallery onSelect={setSelected} />
    </div>
  )
}
