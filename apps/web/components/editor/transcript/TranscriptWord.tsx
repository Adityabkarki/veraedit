'use client'

/**
 * TranscriptWord — a single interactive word span in the transcript.
 *
 * Visual states:
 *   current (playing)  → accent underline
 *   selected           → accent background (text-selection highlight)
 *   filler             → amber/yellow background (⚠ filler)
 *   deleted            → strikethrough + dimmed opacity
 *   search match       → yellow highlight; focused match → orange
 *
 * Click → seeks player to word.startTime
 */

import { useCallback } from 'react'
import { usePlayerStore }    from '@/stores/playerStore'
import { useTimelineStore }  from '@/stores/timelineStore'
import { useTranscriptStore } from '@/stores/transcriptStore'
import type { TranscriptWord as TWord } from '@/stores/transcriptStore'

interface TranscriptWordProps {
  word:          TWord
  isCurrent:     boolean
  isSelected:    boolean
  isSearchMatch: boolean
  isFocusedMatch:boolean
}

export function TranscriptWord({
  word,
  isCurrent,
  isSelected,
  isSearchMatch,
  isFocusedMatch,
}: TranscriptWordProps) {
  const { seek }            = usePlayerStore()
  const { setPlayheadTime } = useTimelineStore()
  const { setSelectedWordIds } = useTranscriptStore()

  const handleClick = useCallback(() => {
    seek(word.startTime)
    setPlayheadTime(word.startTime)
    setSelectedWordIds([word.id])
  }, [word.startTime, word.id, seek, setPlayheadTime, setSelectedWordIds])

  if (word.deleted) {
    return (
      <span
        data-word-id={word.id}
        data-testid={`word-${word.id}`}
        className="line-through text-text-disabled opacity-40 cursor-pointer"
        title={`Deleted · ${word.startTime.toFixed(1)}s`}
        onClick={handleClick}
      >
        {word.text}{' '}
      </span>
    )
  }

  let bg = ''
  if (isFocusedMatch)  bg = 'bg-status-warning text-bg-base rounded px-0.5'
  else if (isSearchMatch) bg = 'bg-status-warning/40 rounded px-0.5'
  else if (isSelected) bg = 'bg-accent/30 rounded px-0.5'
  else if (word.type === 'filler') bg = 'bg-status-warning/25 rounded px-0.5'

  const underline = isCurrent ? 'underline decoration-accent decoration-2' : ''
  const cursor    = 'cursor-pointer hover:underline hover:decoration-accent/50'

  return (
    <span
      data-word-id={word.id}
      data-testid={`word-${word.id}`}
      aria-label={`"${word.text}" at ${word.startTime.toFixed(1)}s${word.type === 'filler' ? ' (filler)' : ''}`}
      onClick={handleClick}
      className={`inline ${bg} ${underline} ${cursor} transition-colors`}
    >
      {word.text}{' '}
    </span>
  )
}
