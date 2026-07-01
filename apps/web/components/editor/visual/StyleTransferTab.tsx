'use client'

/**
 * StyleTransferTab — extract an edit template from any reference video, apply once.
 *
 * Flow:
 *   1. Paste URL (or upload — future) → Extract
 *   2. Template saved to library with source link + detected edits
 *   3. Select template → Apply once (scaled to your video length)
 */

import { useCallback, useEffect, useState } from 'react'
import {
  applyStylePreset,
  deleteStylePreset,
  extractStyleFromUrl,
  extractStyleFromFile,
  fetchStyleLibrary,
  pollTaskStatus,
  pollStyleLibraryForPreset,
  STYLE_EXTRACT_POLL_ATTEMPTS,
  type StylePreset,
} from '@/lib/styleTransfer'
import {
  formatStyleTransferSummary,
  syncStyleTransferFromTimeline,
} from '@/lib/styleTransferSync'
import { ForensicReportPanel } from '@/components/editor/visual/ForensicReportPanel'
import { ApplyConfirmPanel } from '@/components/editor/visual/ApplyConfirmPanel'
import { ApplySummaryToast } from '@/components/editor/visual/ApplySummaryToast'
import { StyleTemplateCard } from '@/components/editor/visual/StyleTemplateCard'
import { api } from '@/lib/api'
import { gapReportFromPreset, type ApplySummary } from '@/lib/styleGapReport'
import { loadEditorProject } from '@/lib/editorData'
import type { ApiTimelineResponse } from '@/lib/timelineApi'

interface StyleTransferTabProps {
  projectId: string
}

export function StyleTransferTab({ projectId }: StyleTransferTabProps) {
  const [url, setUrl]               = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [presetName, setPresetName] = useState('')
  const [strength, setStrength]     = useState(85)
  const [presets, setPresets]       = useState<StylePreset[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [status, setStatus]         = useState('')
  const [error, setError]           = useState<string | null>(null)
  const [busy, setBusy]             = useState(false)
  const [appliedSummary, setAppliedSummary] = useState<string | null>(null)
  const [applySummary, setApplySummary] = useState<ApplySummary | null>(null)
  const [confirmApply, setConfirmApply] = useState(false)
  const loadLibrary = useCallback(async () => {
    const res = await fetchStyleLibrary(projectId)
    if (res.data?.presets) setPresets(res.data.presets)
  }, [projectId])

  useEffect(() => {
    void loadLibrary()
  }, [loadLibrary])

  useEffect(() => {
    void (async () => {
      const tl = await api.get<ApiTimelineResponse>(`/projects/${projectId}/timeline`)
      if (tl.data?.data) {
        const summary = syncStyleTransferFromTimeline(tl.data.data)
        setAppliedSummary(summary ? formatStyleTransferSummary(summary) : null)
      }
    })()
  }, [projectId])

  const runExtractionPoll = async (taskId: string, name: string, countBefore: number) => {
    let poll = await pollTaskStatus(taskId, STYLE_EXTRACT_POLL_ATTEMPTS, (attempt, st, pct, msg) => {
      if (msg) {
        const suffix = pct != null && pct > 0 ? ` (${Math.round(pct)}%)` : ''
        setStatus(`${msg}${suffix}`)
        return
      }
      if (st === 'processing') {
        setStatus('Analyzing reference video…')
        return
      }
      if (st === 'pending' && attempt <= 3) {
        setStatus('Queued — worker picking up task…')
        return
      }
      if (st === 'pending' && attempt > 3) {
        setStatus(
          'Vision scan in progress (OCR on CPU, 3–5 min) — worker is running, please wait…',
        )
        return
      }
      if (attempt > 20) setStatus('Building edit template from detected edits…')
      if (attempt > 45) setStatus('Almost done — saving to your template library…')
      if (attempt > 80) setStatus('Large reference — still analyzing (up to ~7 min)…')
    })

    if (!poll.ok && poll.tasksEndpointMissing) {
      setStatus('Waiting for extraction (library poll)…')
      poll = await pollStyleLibraryForPreset(projectId, name, countBefore)
    }
    return poll
  }

  const handleExtract = async () => {
    if (!url.trim()) {
      setError('Paste a URL or upload a video file below.')
      return
    }
    setBusy(true)
    setError(null)
    setStatus('Analyzing reference video — vision scan for cuts, styles, overlays…')

    const name = presetName.trim() || 'Extracted edit template'
    const countBefore = presets.length
    const res = await extractStyleFromUrl(projectId, url.trim(), name)
    if (res.error || !res.data) {
      setBusy(false)
      setError(res.error ?? 'Could not start extraction.')
      return
    }

    const poll = await runExtractionPoll(res.data.task_id, name, countBefore)
    setBusy(false)

    if (!poll.ok) {
      setStatus('')
      setError(poll.error ?? 'Extraction did not finish. Is the Celery worker running?')
      await loadLibrary()
      return
    }

    setStatus('Edit template saved to your library.')
    setUrl('')
    setPresetName('')
    await loadLibrary()
  }

  const handleExtractFile = async () => {
    if (!uploadFile) {
      setError('Choose a video file to analyze.')
      return
    }
    setBusy(true)
    setError(null)
    setStatus('Vision analysis on uploaded video — OCR, layouts, effects…')

    const name = presetName.trim() || `Style from ${uploadFile.name.replace(/\.[^.]+$/, '')}`
    const countBefore = presets.length
    const res = await extractStyleFromFile(projectId, uploadFile, name)
    if (res.error || !res.data) {
      setBusy(false)
      setError(res.error ?? 'Could not start extraction.')
      return
    }

    const poll = await runExtractionPoll(res.data.task_id, name, countBefore)
    setBusy(false)

    if (!poll.ok) {
      setStatus('')
      setError(poll.error ?? 'Extraction did not finish. Is the Celery worker running?')
      await loadLibrary()
      return
    }

    setStatus('Edit template saved from your upload.')
    setUploadFile(null)
    setPresetName('')
    await loadLibrary()
  }

  const runApply = async () => {
    if (!selectedId) return
    setConfirmApply(false)
    setBusy(true)
    setError(null)
    setApplySummary(null)
    setStatus('Applying edit template to your timeline (scaled to your video)…')

    const res = await applyStylePreset(projectId, selectedId, strength / 100)
    setBusy(false)

    if (res.error || !res.data) {
      setError(res.error ?? 'Could not apply template.')
      return
    }

    if (res.data.apply_summary) {
      setApplySummary(res.data.apply_summary)
    }
    setStatus(res.data.message ?? 'Template applied.')
    await loadEditorProject(projectId, { preservePlayhead: true })
    const tl = await api.get<ApiTimelineResponse>(`/projects/${projectId}/timeline`)
    if (tl.data?.data) {
      const summary = syncStyleTransferFromTimeline(tl.data.data)
      setAppliedSummary(summary ? formatStyleTransferSummary(summary) : null)
    }
  }

  const handleApply = () => {
    if (!selectedId) {
      setError('Select a template from your library first.')
      return
    }
    const selectedPreset = presets.find((p) => p.id === selectedId)
    const gr = selectedPreset ? gapReportFromPreset(selectedPreset) : null
    if (gr && gr.implemented.length > 0) {
      setConfirmApply(true)
      return
    }
    void runApply()
  }

  const handleDelete = async (presetId: string) => {
    const res = await deleteStylePreset(projectId, presetId)
    if (res.error) {
      setError(res.error)
      return
    }
    if (selectedId === presetId) setSelectedId(null)
    await loadLibrary()
  }

  const selected = presets.find((p) => p.id === selectedId)

  return (
    <div data-testid="style-transfer-tab" className="flex flex-col h-full overflow-y-auto p-3 gap-4">
      <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 space-y-2">
        <p className="text-xs font-semibold text-text-primary">Style Template Extractor</p>
        <p className="text-[11px] text-text-secondary leading-relaxed">
          Paste a YouTube, TikTok, Instagram, or Facebook Shorts link — we analyze the edit and save a
          named template (auto-titled from the video). Applying a template places core edit elements
          (VFX, SFX, B-roll, transitions) from the Effects drawer onto your timeline. Add individual
          elements anytime via ✨ Effects → Edit elements.
        </p>
      </div>

      {/* Step 1 — Extract */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-text-disabled mb-2">
          Step 1 — Reference video
        </p>
        <input
          id="style-url"
          data-testid="style-url-input"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Direct YouTube / TikTok / Instagram link (not a Google search page)"
          className="w-full px-3 py-2 text-sm rounded-lg bg-bg-overlay border border-bg-overlay focus:border-accent outline-none text-text-primary"
        />
        <input
          id="style-name"
          data-testid="style-name-input"
          type="text"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          placeholder="Template name (optional — defaults to video title)"
          className="w-full mt-2 px-3 py-2 text-sm rounded-lg bg-bg-overlay border border-bg-overlay focus:border-accent outline-none text-text-primary"
        />
        <button
          type="button"
          data-testid="style-extract-btn"
          disabled={busy || !url.trim()}
          onClick={() => void handleExtract()}
          className="mt-3 w-full py-2 rounded-lg bg-accent hover:bg-accent-glow text-white text-sm font-medium disabled:opacity-50"
        >
          Extract from URL
        </button>

        <p className="text-[10px] text-text-disabled text-center my-2">— or upload a file —</p>

        <input
          id="style-file"
          data-testid="style-file-input"
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          disabled={busy}
          onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
          className="w-full text-xs text-text-secondary file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-bg-overlay file:text-text-primary"
        />
        {uploadFile && (
          <p className="text-[10px] text-text-secondary mt-1 truncate">{uploadFile.name}</p>
        )}
        <button
          type="button"
          data-testid="style-extract-file-btn"
          disabled={busy || !uploadFile}
          onClick={() => void handleExtractFile()}
          className="mt-2 w-full py-2 rounded-lg border border-accent text-accent hover:bg-accent/10 text-sm font-medium disabled:opacity-40"
        >
          Extract from upload
        </button>
      </div>

      {selectedId && (
        <ForensicReportPanel projectId={projectId} presetId={selectedId} />
      )}

      {/* Step 2 — Library */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-text-disabled mb-2">
          Step 2 — Template library ({presets.length})
        </p>

        {presets.length === 0 ? (
          <p className="text-xs text-text-disabled text-center py-4">
            No templates yet. Extract one from a reference video above.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {presets.map((p) => (
              <StyleTemplateCard
                key={p.id}
                preset={p}
                selected={selectedId === p.id}
                onSelect={() => setSelectedId(p.id)}
                onDelete={() => void handleDelete(p.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Step 3 — Apply once */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-text-disabled mb-2">
          Step 3 — Apply to your video
        </p>

        {selected && (
          <p className="text-[11px] text-text-secondary mb-2 leading-relaxed">
            Applies <strong className="text-text-primary">{selected.name}</strong> once,
            scaled to your video length. Caption styling only — your words stay.
            Graphics and logos become editable placeholders.
            {' '}
            <span className="text-text-disabled">
              Applying again replaces the previous template on the timeline (does not stack).
            </span>
          </p>
        )}

        <label className="flex items-center justify-between text-xs text-text-secondary mb-1">
          <span>Strength</span>
          <span data-testid="style-strength-value">{strength}%</span>
        </label>
        <input
          data-testid="style-strength-slider"
          type="range"
          min={0}
          max={100}
          value={strength}
          onChange={(e) => setStrength(Number(e.target.value))}
          className="w-full accent-accent"
        />

        <button
          type="button"
          data-testid="style-apply-btn"
          disabled={busy || !selectedId}
          onClick={handleApply}
          className="mt-3 w-full py-2 rounded-lg border border-accent text-accent hover:bg-accent/10 text-sm font-medium disabled:opacity-40"
        >
          Apply template once
        </button>
      </div>

      {confirmApply && selected && gapReportFromPreset(selected) && (
        <ApplyConfirmPanel
          presetName={selected.name}
          gapReport={gapReportFromPreset(selected)!}
          onCancel={() => setConfirmApply(false)}
          onConfirm={() => void runApply()}
        />
      )}

      {applySummary && <ApplySummaryToast summary={applySummary} />}

      {appliedSummary && (
        <div
          data-testid="style-applied-summary"
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1"
        >
          <p className="text-xs font-semibold text-text-primary">Active on timeline</p>
          <p className="text-[11px] text-text-secondary leading-relaxed">{appliedSummary}</p>
        </div>
      )}

      {status && (
        <p className="text-xs text-status-info" data-testid="style-status">{status}</p>
      )}
      {error && (
        <p className="text-xs text-status-error" data-testid="style-error">{error}</p>
      )}
    </div>
  )
}
