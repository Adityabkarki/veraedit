'use client'

/**
 * ExportModal — pick a platform, save timeline, run FFmpeg render, download MP4.
 */

import { useState } from 'react'
import {
  EXPORT_PLATFORMS,
  exportProjectVideo,
  triggerDownload,
  type ExportPlatform,
} from '@/lib/renderExport'

interface ExportModalProps {
  projectId: string
  open: boolean
  onClose: () => void
}

export function ExportModal({ projectId, open, onClose }: ExportModalProps) {
  const [platform, setPlatform] = useState<ExportPlatform>('youtube')
  const [status, setStatus]     = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError]       = useState<string | null>(null)
  const [busy, setBusy]         = useState(false)

  if (!open) return null

  const handleExport = async () => {
    setBusy(true)
    setError(null)
    setStatus('Saving timeline…')
    setProgress(0)

    const result = await exportProjectVideo(projectId, platform, (pct, st) => {
      setProgress(Math.round(pct))
      setStatus(st === 'ready' ? 'Done' : `Rendering… (${st})`)
    })

    setBusy(false)

    if (result.error) {
      setError(result.error)
      return
    }

    if (result.downloadUrl) {
      triggerDownload(result.downloadUrl, `viraedit-${platform}.mp4`)
      setStatus('Download started')
      setTimeout(onClose, 1200)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      data-testid="export-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Export video"
    >
      <div className="w-full max-w-md rounded-xl border border-bg-overlay bg-bg-elevated shadow-2xl p-5">
        <h2 className="text-lg font-semibold text-text-primary mb-1">Export Video</h2>
        <p className="text-sm text-text-secondary mb-4">
          Save your timeline and render an MP4 with FFmpeg. This may take a minute.
        </p>

        <fieldset className="space-y-2 mb-4">
          <legend className="text-xs font-medium text-text-disabled uppercase tracking-wider mb-2">
            Platform
          </legend>
          {EXPORT_PLATFORMS.map((p) => (
            <label
              key={p.id}
              data-testid={`export-platform-${p.id}`}
              className={[
                'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                platform === p.id
                  ? 'border-accent bg-accent/10'
                  : 'border-bg-overlay hover:border-text-disabled',
              ].join(' ')}
            >
              <input
                type="radio"
                name="export-platform"
                value={p.id}
                checked={platform === p.id}
                onChange={() => setPlatform(p.id)}
                className="accent-accent"
              />
              <span className="flex-1">
                <span className="text-sm font-medium text-text-primary block">{p.label}</span>
                <span className="text-xs text-text-disabled">{p.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {busy && (
          <div className="mb-4" data-testid="export-progress">
            <div className="h-1.5 rounded-full bg-bg-overlay overflow-hidden mb-1">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
            <p className="text-xs text-text-secondary">{status}</p>
          </div>
        )}

        {error && (
          <p className="text-sm text-status-error mb-4" data-testid="export-error">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg text-text-secondary hover:bg-bg-overlay transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="export-start"
            onClick={() => void handleExport()}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg bg-accent hover:bg-accent-glow text-white font-medium transition-colors disabled:opacity-50"
          >
            {busy ? 'Exporting…' : 'Start Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
