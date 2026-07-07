'use client'

/**
 * ExportModal — platform picker, completeness gate, save timeline, FFmpeg render.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  EXPORT_PLATFORMS,
  exportProjectVideo,
  downloadProjectRender,
  type ExportPlatform,
} from '@/lib/renderExport'
import {
  applyExportReadinessFixes,
  fetchExportReadiness,
  type ExportReadinessResponse,
} from '@/lib/directorApi'

interface ExportModalProps {
  projectId: string
  open: boolean
  onClose: () => void
}

export function ExportModal({ projectId, open, onClose }: ExportModalProps) {
  const [platform, setPlatform] = useState<ExportPlatform>('youtube')
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [readiness, setReadiness] = useState<ExportReadinessResponse | null>(null)
  const [readinessLoading, setReadinessLoading] = useState(false)
  const [fixingReadiness, setFixingReadiness] = useState(false)
  const [exportAnyway, setExportAnyway] = useState(false)

  const loadReadiness = useCallback(async () => {
    setReadinessLoading(true)
    const { data, error: fetchErr } = await fetchExportReadiness(projectId)
    setReadinessLoading(false)
    if (fetchErr) {
      setReadiness(null)
      return
    }
    setReadiness(data)
  }, [projectId])

  useEffect(() => {
    if (!open) return
    setExportAnyway(false)
    setError(null)
    void loadReadiness()
  }, [open, loadReadiness])

  if (!open) return null

  const hasBlockingIssues =
    readiness != null &&
    !readiness.skipped &&
    !readiness.ready &&
    (readiness.unresolvedCount ?? 0) > 0

  const handleAutoFix = async () => {
    setFixingReadiness(true)
    setError(null)
    const { data, error: fixErr } = await applyExportReadinessFixes(projectId)
    setFixingReadiness(false)
    if (fixErr) {
      setError(fixErr)
      return
    }
    setReadiness(data)
  }

  const handleExport = async () => {
    if (hasBlockingIssues && !exportAnyway) {
      setError('Resolve export readiness issues or check "Export anyway" to continue.')
      return
    }

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

    if (result.downloadUrl && result.renderId) {
      const dl = await downloadProjectRender(
        projectId,
        result.renderId,
        platform,
        result.downloadUrl,
      )
      if (!dl.ok) {
        setError(dl.error ?? 'Render finished but the download could not start.')
        return
      }
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
      <div className="w-full max-w-md rounded-xl border border-bg-overlay bg-bg-elevated shadow-2xl p-5 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-text-primary mb-1">Export Video</h2>
        <p className="text-sm text-text-secondary mb-4">
          Save your timeline and render an MP4. Completeness is checked when a Director timeline exists.
        </p>

        {readinessLoading && (
          <p className="text-xs text-text-disabled mb-3">Checking export readiness…</p>
        )}

        {readiness && !readiness.skipped && (readiness.checklist?.length ?? 0) > 0 && (
          <div
            className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"
            data-testid="export-readiness-panel"
          >
            <p className="text-sm font-medium text-text-primary mb-2">
              {readiness.ready
                ? 'Export readiness — all clear'
                : `${readiness.unresolvedCount} issue(s) before export`}
            </p>
            <ul className="text-xs text-text-secondary space-y-1.5 mb-3 list-disc pl-4">
              {readiness.checklist.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {!readiness.ready && (
              <button
                type="button"
                data-testid="export-readiness-autofix"
                onClick={() => void handleAutoFix()}
                disabled={fixingReadiness || busy}
                className="text-xs px-3 py-1.5 rounded-md bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-50"
              >
                {fixingReadiness ? 'Applying fixes…' : 'Fix automatically (Ken Burns / title cards)'}
              </button>
            )}
          </div>
        )}

        {readiness && !readiness.skipped && readiness.ready && (
          <p className="text-xs text-emerald-400 mb-3" data-testid="export-readiness-ok">
            Director timeline passed the completeness gate.
          </p>
        )}

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

        {hasBlockingIssues && (
          <label className="flex items-center gap-2 mb-4 text-xs text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={exportAnyway}
              onChange={(e) => setExportAnyway(e.target.checked)}
              className="accent-accent"
              data-testid="export-anyway"
            />
            Export anyway (skip remaining completeness warnings)
          </label>
        )}

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
            disabled={busy || fixingReadiness || (hasBlockingIssues && !exportAnyway)}
            className="px-4 py-2 text-sm rounded-lg bg-accent hover:bg-accent-glow text-white font-medium transition-colors disabled:opacity-50"
          >
            {busy ? 'Exporting…' : 'Start Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
