'use client'

/**
 * CaptionRow — single subtitle entry in the Subtitle Editor list.
 *
 * Normal state:  index | timestamp | caption text | [add] [delete]
 * Editing state: index | editable timestamp | <textarea> | [✓] [✕]
 *
 * Clicking the text area starts inline edit.
 * Tab or Enter commits; Escape cancels.
 * Timestamps are also editable (click → input).
 *
 * Seeks the player to the caption's startTime on click.
 */

import { useRef, useCallback, useState } from 'react'
import { useCaptionsStore }  from '@/stores/captionsStore'
import { usePlayerStore }    from '@/stores/playerStore'
import { useTimelineStore }  from '@/stores/timelineStore'
import type { Caption }      from '@/stores/captionsStore'

interface CaptionRowProps {
  caption:        Caption
  isEditing:      boolean
  isSelected:     boolean
  isSearchMatch:  boolean
}

function formatTime(s: number): string {
  const m  = Math.floor(s / 60)
  const ss = (s % 60).toFixed(1)
  return `${String(m).padStart(2, '0')}:${ss.padStart(4, '0')}`
}

function parseTime(val: string): number | null {
  const match = val.match(/^(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/)
  if (!match) return null
  const m  = parseInt(match[1])
  const s  = parseInt(match[2])
  const ms = match[3] ? parseInt(match[3].padEnd(3, '0')) : 0
  return m * 60 + s + ms / 1000
}

export function CaptionRow({ caption, isEditing, isSelected, isSearchMatch }: CaptionRowProps) {
  const {
    startEdit, stopEdit, updateText, updateStartTime, updateEndTime,
    addCaption, deleteCaption, selectCaption,
  } = useCaptionsStore()

  const { seek }            = usePlayerStore()
  const { setPlayheadTime } = useTimelineStore()

  const textRef         = useRef<HTMLTextAreaElement>(null)
  const [editStart, setEditStart] = useState(formatTime(caption.startTime))
  const [editEnd,   setEditEnd]   = useState(formatTime(caption.endTime))
  const [editingTime, setEditingTime] = useState<'start' | 'end' | null>(null)

  const handleRowClick = useCallback(() => {
    seek(caption.startTime)
    setPlayheadTime(caption.startTime)
    selectCaption(caption.id)
  }, [caption.startTime, caption.id, seek, setPlayheadTime, selectCaption])

  const handleTextClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    handleRowClick()
    startEdit(caption.id)
    setTimeout(() => textRef.current?.focus(), 10)
  }, [caption.id, handleRowClick, startEdit])

  const commitText = useCallback(() => {
    stopEdit()
  }, [stopEdit])

  const commitStartTime = useCallback(() => {
    const t = parseTime(editStart)
    if (t !== null) updateStartTime(caption.id, t)
    else setEditStart(formatTime(caption.startTime))
    setEditingTime(null)
  }, [editStart, caption.id, caption.startTime, updateStartTime])

  const commitEndTime = useCallback(() => {
    const t = parseTime(editEnd)
    if (t !== null) updateEndTime(caption.id, t)
    else setEditEnd(formatTime(caption.endTime))
    setEditingTime(null)
  }, [editEnd, caption.id, caption.endTime, updateEndTime])

  return (
    <div
      data-testid={`caption-row-${caption.id}`}
      className={[
        'flex items-start gap-2 px-3 py-2 border-b border-bg-overlay transition-colors group',
        isSelected   ? 'bg-accent/5'   : 'hover:bg-bg-overlay',
        isSearchMatch ? 'border-l-2 border-l-status-warning' : '',
      ].join(' ')}
      onClick={handleRowClick}
    >
      {/* Index */}
      <span className="text-[11px] font-mono text-text-disabled flex-shrink-0 mt-0.5 w-5 text-right">
        {caption.index}
      </span>

      {/* Timestamps */}
      <div className="flex flex-col gap-0.5 flex-shrink-0 text-[10px] font-mono text-text-disabled">
        {editingTime === 'start' ? (
          <input
            data-testid={`caption-start-input-${caption.id}`}
            value={editStart}
            onChange={(e) => setEditStart(e.target.value)}
            onBlur={commitStartTime}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitStartTime()
              if (e.key === 'Escape') { setEditStart(formatTime(caption.startTime)); setEditingTime(null) }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-16 bg-bg-overlay rounded px-1 text-text-primary outline-none"
          />
        ) : (
          <span
            data-testid={`caption-start-${caption.id}`}
            className="cursor-pointer hover:text-text-secondary"
            onClick={(e) => { e.stopPropagation(); setEditStart(formatTime(caption.startTime)); setEditingTime('start') }}
          >
            {formatTime(caption.startTime)}
          </span>
        )}

        {editingTime === 'end' ? (
          <input
            data-testid={`caption-end-input-${caption.id}`}
            value={editEnd}
            onChange={(e) => setEditEnd(e.target.value)}
            onBlur={commitEndTime}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEndTime()
              if (e.key === 'Escape') { setEditEnd(formatTime(caption.endTime)); setEditingTime(null) }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-16 bg-bg-overlay rounded px-1 text-text-primary outline-none"
          />
        ) : (
          <span
            data-testid={`caption-end-${caption.id}`}
            className="cursor-pointer hover:text-text-secondary"
            onClick={(e) => { e.stopPropagation(); setEditEnd(formatTime(caption.endTime)); setEditingTime('end') }}
          >
            {formatTime(caption.endTime)}
          </span>
        )}
      </div>

      {/* Caption text */}
      <div className="flex-1 min-w-0" onClick={handleTextClick}>
        {isEditing ? (
          <textarea
            ref={textRef}
            data-testid={`caption-text-input-${caption.id}`}
            value={caption.text}
            onChange={(e) => updateText(caption.id, e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Escape') commitText()
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText() }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-bg-overlay border border-accent rounded px-2 py-1
                       text-sm text-text-primary outline-none resize-none leading-snug"
            rows={2}
          />
        ) : (
          <span
            data-testid={`caption-text-${caption.id}`}
            className={[
              'text-sm leading-snug block cursor-text',
              isSearchMatch ? 'text-status-warning' : 'text-text-secondary',
              isSelected ? 'text-text-primary' : '',
            ].join(' ')}
          >
            {caption.text || <span className="text-text-disabled italic">Empty caption</span>}
          </span>
        )}
      </div>

      {/* Action buttons (visible on hover) */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          data-testid={`caption-add-${caption.id}`}
          onClick={(e) => { e.stopPropagation(); addCaption(caption.id) }}
          aria-label="Add caption after"
          title="Add caption after"
          className="p-1 rounded text-text-disabled hover:text-status-success hover:bg-bg-overlay transition-colors text-sm"
        >
          +
        </button>
        <button
          data-testid={`caption-delete-${caption.id}`}
          onClick={(e) => { e.stopPropagation(); deleteCaption(caption.id) }}
          aria-label="Delete caption"
          title="Delete caption"
          className="p-1 rounded text-text-disabled hover:text-status-error hover:bg-bg-overlay transition-colors text-xs"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
