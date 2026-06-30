'use client'

/**
 * TextEditor — Descript-style transcript cutting UI (Module 04).
 *
 * Click words to seek; click two words to mark a manual cut range.
 * Toggle filler/silence cuts; apply merged cuts to the source video via API.
 */

import { useState, useMemo } from 'react'

export interface Word {
  word: string
  start: number
  end: number
}

export interface Cut {
  start: number
  end: number
  reason?: string
}

interface TextEditorProps {
  words: Word[]
  currentTime: number
  fillerCuts?: Cut[]
  silenceCuts?: Cut[]
  onSeek: (t: number) => void
  onApply: (cuts: Cut[]) => void
  applying?: boolean
}

export function TextEditor({
  words,
  currentTime,
  fillerCuts = [],
  silenceCuts = [],
  onSeek,
  onApply,
  applying = false,
}: TextEditorProps) {
  const [manualCuts, setManualCuts] = useState<Cut[]>([])
  const [activeFillers, setActiveFillers] = useState(false)
  const [activeSilences, setActiveSilences] = useState(false)
  const [selStart, setSelStart] = useState<number | null>(null)

  const allCuts = useMemo(() => {
    const base = [...manualCuts]
    if (activeFillers) base.push(...fillerCuts)
    if (activeSilences) base.push(...silenceCuts)
    return mergeCuts(base)
  }, [manualCuts, activeFillers, activeSilences, fillerCuts, silenceCuts])

  const cutWordSet = useMemo(() => {
    const set = new Set<number>()
    allCuts.forEach((cut) => {
      words.forEach((w, i) => {
        if (w.start >= cut.start && w.end <= cut.end) set.add(i)
      })
    })
    return set
  }, [allCuts, words])

  const handleWordClick = (w: Word, idx: number) => {
    onSeek(w.start)
    if (selStart === null) {
      setSelStart(idx)
    } else {
      const s = Math.min(selStart, idx)
      const e = Math.max(selStart, idx)
      const range = words.slice(s, e + 1)
      if (range.length > 0) {
        setManualCuts((prev) =>
          mergeCuts([
            ...prev,
            {
              start: range[0].start,
              end: range[range.length - 1].end,
              reason: 'manual',
            },
          ])
        )
      }
      setSelStart(null)
    }
  }

  const removeManualCut = (cut: Cut) => {
    setManualCuts((prev) =>
      prev.filter((m) => !(m.start === cut.start && m.end === cut.end && m.reason === 'manual'))
    )
  }

  if (words.length === 0) {
    return (
      <div data-testid="text-editor" className="flex flex-col h-full items-center justify-center p-6 text-center">
        <p className="text-sm text-text-secondary">No transcript words yet.</p>
        <p className="text-xs text-text-disabled mt-1">
          Transcribe your video to edit it by text.
        </p>
      </div>
    )
  }

  return (
    <div data-testid="text-editor" className="flex flex-col h-full min-h-0">
      <div className="flex gap-2 p-3 border-b border-bg-overlay flex-wrap items-center flex-shrink-0">
        <button
          type="button"
          data-testid="toggle-fillers"
          onClick={() => setActiveFillers(!activeFillers)}
          className={[
            'text-xs px-3 py-1.5 rounded border transition-all',
            activeFillers
              ? 'bg-status-warning text-white border-status-warning'
              : 'border-bg-overlay text-text-secondary hover:text-text-primary',
          ].join(' ')}
        >
          Fillers ({fillerCuts.length})
        </button>
        <button
          type="button"
          data-testid="toggle-silences"
          onClick={() => setActiveSilences(!activeSilences)}
          className={[
            'text-xs px-3 py-1.5 rounded border transition-all',
            activeSilences
              ? 'bg-accent text-white border-accent'
              : 'border-bg-overlay text-text-secondary hover:text-text-primary',
          ].join(' ')}
        >
          Silences ({silenceCuts.length})
        </button>
        {allCuts.length > 0 && (
          <button
            type="button"
            data-testid="apply-cuts-btn"
            disabled={applying}
            onClick={() => onApply(allCuts)}
            className="ml-auto text-xs bg-accent text-white px-4 py-1.5 rounded
                       hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {applying ? 'Applying…' : `Apply ${allCuts.length} cuts`}
          </button>
        )}
        {selStart !== null && (
          <span className="text-xs text-accent ml-2">Click another word to select range →</span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 leading-8 select-none">
        {words.map((w, i) => {
          const isCut = cutWordSet.has(i)
          const isActive = currentTime >= w.start && currentTime < w.end
          const isSelStart = selStart === i
          return (
            <span
              key={`${w.start}-${i}`}
              data-testid={`text-word-${i}`}
              onClick={() => handleWordClick(w, i)}
              title={`${w.start.toFixed(2)}s`}
              className={[
                'inline cursor-pointer rounded px-0.5 transition-colors',
                isCut ? 'line-through text-text-disabled' : '',
                isActive && !isCut ? 'bg-accent/20 font-semibold text-text-primary' : '',
                isSelStart ? 'bg-accent text-white' : '',
                !isCut && !isActive ? 'hover:bg-bg-overlay text-text-primary' : '',
              ].join(' ')}
            >
              {w.word}{' '}
            </span>
          )
        })}
      </div>

      {allCuts.length > 0 && (
        <div className="border-t border-bg-overlay p-2 max-h-24 overflow-y-auto bg-bg-elevated flex-shrink-0">
          <p className="text-xs text-text-disabled mb-1 font-medium">
            Pending cuts ({allCuts.length})
          </p>
          {allCuts.map((c, i) => (
            <div key={`${c.start}-${c.end}-${i}`} className="flex justify-between text-xs py-0.5">
              <span className="text-text-secondary">
                {c.reason ?? 'cut'} · {c.start.toFixed(1)}s–{c.end.toFixed(1)}s
              </span>
              {c.reason === 'manual' && (
                <button
                  type="button"
                  onClick={() => removeManualCut(c)}
                  className="text-status-error hover:text-status-error/80"
                >
                  undo
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function mergeCuts(cuts: Cut[]): Cut[] {
  if (!cuts.length) return []
  const sorted = [...cuts].sort((a, b) => a.start - b.start)
  const out: Cut[] = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1]
    if (sorted[i].start <= last.end + 0.05) {
      last.end = Math.max(last.end, sorted[i].end)
    } else {
      out.push({ ...sorted[i] })
    }
  }
  return out
}
