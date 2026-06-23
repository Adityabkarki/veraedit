'use client'

/**
 * ExportOptions — SRT / VTT / Burn-in export buttons.
 *
 * SRT export uses UTF-8 BOM (﻿) for Windows compatibility.
 * VTT export uses WebVTT format without BOM.
 * "Burn into video" is a placeholder for EP-7.1 (render engine).
 */

import { useCaptionsStore } from '@/stores/captionsStore'

export function ExportOptions() {
  const { exportSRT, exportVTT, captions } = useCaptionsStore()

  return (
    <div
      data-testid="export-options"
      className="px-3 py-3 border-t border-bg-overlay flex-shrink-0"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled mb-2">
        Export captions
      </p>
      <div className="flex gap-2">
        <button
          data-testid="export-srt"
          onClick={exportSRT}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg
                     bg-bg-overlay text-text-secondary text-xs font-medium
                     hover:text-text-primary hover:bg-bg-elevated transition-colors border border-bg-elevated"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M6 1V8M6 8L3.5 5.5M6 8L8.5 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 10H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          SRT
        </button>

        <button
          data-testid="export-vtt"
          onClick={exportVTT}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg
                     bg-bg-overlay text-text-secondary text-xs font-medium
                     hover:text-text-primary hover:bg-bg-elevated transition-colors border border-bg-elevated"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M6 1V8M6 8L3.5 5.5M6 8L8.5 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 10H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          VTT
        </button>

        <button
          data-testid="export-burn"
          disabled
          title="Burn captions into video — requires video to be loaded (EP-7.1)"
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg
                     bg-accent text-white text-xs font-medium
                     hover:bg-accent-glow transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          🔥 Burn in
        </button>
      </div>
      <p className="text-[10px] text-text-disabled mt-2 text-center">
        SRT uses UTF-8 BOM (Windows-safe) · {captions.length} captions
      </p>
    </div>
  )
}
