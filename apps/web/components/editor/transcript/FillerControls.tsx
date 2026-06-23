'use client'

/**
 * FillerControls — toolbar for managing filler words and long silences.
 *
 * Shows:
 *   "12 fillers detected — removes 8.4s"  [Remove all]
 *   "3 silences > 0.8s detected — saves 3.2s" [Remove all]
 *
 * Collapsed to a single row; expands on click if needed.
 */

import { useCallback } from 'react'
import { toast } from 'sonner'
import { applyAvCutsFromRanges } from '@/lib/applySuggestionClient'
import {
  useTranscriptStore,
  getFillerWords,
  getSilenceWords,
  getTotalSavedTime,
} from '@/stores/transcriptStore'

const SILENCE_MIN = 0.8   // seconds — silences longer than this are "long"

export function FillerControls() {
  const { words, deleteAllFillers, removeLongSilences } = useTranscriptStore()

  const fillerWords  = getFillerWords(words)
  const silenceWords = getSilenceWords(words, SILENCE_MIN)

  const fillerTime   = getTotalSavedTime(fillerWords.map((w) => w.id), words)
  const silenceTime  = getTotalSavedTime(silenceWords.map((w) => w.id), words)

  const handleRemoveFillers = useCallback(() => {
    deleteAllFillers()
    const updated = useTranscriptStore.getState().words
    const ranges = updated
      .filter((w) => w.type === 'filler' && w.deleted)
      .map((w) => ({ start: w.startTime, end: w.endTime }))
    const n = applyAvCutsFromRanges(ranges, 'Remove fillers')
    if (n > 0) {
      toast.success(`Removed ${n} filler segment(s) from script and timeline.`)
    } else {
      toast.message('Fillers marked removed in script.')
    }
  }, [deleteAllFillers])

  const handleRemoveSilences = useCallback(() => {
    removeLongSilences(SILENCE_MIN)
    const updated = useTranscriptStore.getState().words
    const ranges = updated
      .filter((w) => w.type === 'silence' && w.deleted)
      .map((w) => ({ start: w.startTime, end: w.endTime }))
    const n = applyAvCutsFromRanges(ranges, 'Remove silences')
    if (n > 0) {
      toast.success(`Removed ${n} silence segment(s) from script and timeline.`)
    }
  }, [removeLongSilences])

  if (fillerWords.length === 0 && silenceWords.length === 0) return null

  return (
    <div
      data-testid="filler-controls"
      className="px-3 py-2 border-b border-bg-overlay flex-shrink-0 space-y-1.5"
    >
      {/* Filler row */}
      {fillerWords.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-status-warning flex-1 truncate">
            ⚠ {fillerWords.length} filler{fillerWords.length !== 1 ? 's' : ''} detected
            {' '}
            <span className="text-text-disabled">
              (saves {fillerTime.toFixed(1)}s)
            </span>
          </span>
          <button
            data-testid="remove-all-fillers"
            onClick={handleRemoveFillers}
            className="flex-shrink-0 text-[11px] px-2 py-0.5 rounded
                       bg-status-warning/10 text-status-warning
                       hover:bg-status-warning/20 transition-colors font-medium"
          >
            Remove all
          </button>
        </div>
      )}

      {/* Silence row */}
      {silenceWords.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-text-secondary flex-1 truncate">
            ▬ {silenceWords.length} silence{silenceWords.length !== 1 ? 's' : ''} &gt;{SILENCE_MIN}s
            {' '}
            <span className="text-text-disabled">
              (saves {silenceTime.toFixed(1)}s)
            </span>
          </span>
          <button
            data-testid="remove-long-silences"
            onClick={handleRemoveSilences}
            className="flex-shrink-0 text-[11px] px-2 py-0.5 rounded
                       bg-bg-overlay text-text-secondary
                       hover:bg-bg-elevated transition-colors font-medium"
          >
            Remove all
          </button>
        </div>
      )}
    </div>
  )
}
