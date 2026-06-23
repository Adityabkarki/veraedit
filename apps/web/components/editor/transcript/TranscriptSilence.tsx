'use client'

/**
 * TranscriptSilence — grey inline block representing a silent gap.
 *
 * Shows: [■■■ 0.8s silence] — visually distinct from words.
 * Clicking seeks to the silence start time.
 * When deleted, shows as a very thin dimmed bar (silence removed).
 */

import { useCallback } from 'react'
import { usePlayerStore }    from '@/stores/playerStore'
import { useTimelineStore }  from '@/stores/timelineStore'
import type { TranscriptWord } from '@/stores/transcriptStore'

interface TranscriptSilenceProps {
  word: TranscriptWord   // type === 'silence'
}

export function TranscriptSilence({ word }: TranscriptSilenceProps) {
  const { seek }            = usePlayerStore()
  const { setPlayheadTime } = useTimelineStore()

  const handleClick = useCallback(() => {
    seek(word.startTime)
    setPlayheadTime(word.startTime)
  }, [word.startTime, seek, setPlayheadTime])

  const dur = (word.silenceDuration ?? 0).toFixed(1)

  if (word.deleted) {
    return (
      <span
        data-testid={`silence-${word.id}`}
        className="inline-flex items-center mx-0.5"
        aria-label={`Removed ${dur}s silence`}
      >
        <span className="inline-block w-4 h-0.5 bg-text-disabled opacity-30 rounded" />
      </span>
    )
  }

  return (
    <span
      data-testid={`silence-${word.id}`}
      data-word-id={word.id}
      onClick={handleClick}
      title={`${dur}s silence — click to preview`}
      aria-label={`${dur}s silence`}
      className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded
                 bg-bg-overlay border border-bg-elevated text-text-disabled
                 text-[10px] font-mono cursor-pointer
                 hover:bg-bg-elevated hover:text-text-secondary transition-colors
                 align-middle"
    >
      <span className="text-[8px]">▬▬▬</span>
      {dur}s
    </span>
  )
}
