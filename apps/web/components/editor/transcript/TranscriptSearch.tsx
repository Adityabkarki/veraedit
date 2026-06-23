'use client'

/**
 * TranscriptSearch — Ctrl+F search overlay for the transcript.
 *
 * Shows: [Search... ] ↑ ↓  2 / 8  ✕
 * Opens when the parent detects Ctrl+F.
 * Closed by Escape or ✕.
 * ↑↓ navigate between matches.
 * Enter = next match.
 */

import { useRef, useEffect } from 'react'
import { useTranscriptStore } from '@/stores/transcriptStore'

interface TranscriptSearchProps {
  onClose: () => void
}

export function TranscriptSearch({ onClose }: TranscriptSearchProps) {
  const {
    searchQuery,
    setSearchQuery,
    searchMatchIds,
    searchIndex,
    nextSearchMatch,
    prevSearchMatch,
  } = useTranscriptStore()

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape')  { e.preventDefault(); onClose() }
    if (e.key === 'Enter')   { e.preventDefault(); nextSearchMatch() }
    if (e.key === 'ArrowUp') { e.preventDefault(); prevSearchMatch() }
    if (e.key === 'ArrowDown') { e.preventDefault(); nextSearchMatch() }
  }

  const count    = searchMatchIds.length
  const position = count > 0 ? `${searchIndex + 1} / ${count}` : '0'

  return (
    <div
      data-testid="transcript-search"
      className="flex items-center gap-2 px-3 py-2 bg-bg-elevated border-b border-bg-overlay flex-shrink-0"
    >
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-text-disabled flex-shrink-0" aria-hidden="true">
        <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M8.5 8.5L11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>

      <input
        ref={inputRef}
        data-testid="transcript-search-input"
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search transcript…"
        aria-label="Search transcript"
        className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-disabled outline-none"
      />

      {/* Match counter */}
      <span
        data-testid="search-match-count"
        className="text-xs font-mono text-text-disabled flex-shrink-0 min-w-[3rem] text-center"
      >
        {count > 0 ? position : '—'}
      </span>

      {/* Prev */}
      <button
        data-testid="search-prev"
        onClick={prevSearchMatch}
        disabled={count === 0}
        aria-label="Previous match"
        className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors disabled:opacity-30"
      >
        ↑
      </button>

      {/* Next */}
      <button
        data-testid="search-next"
        onClick={nextSearchMatch}
        disabled={count === 0}
        aria-label="Next match"
        className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors disabled:opacity-30"
      >
        ↓
      </button>

      {/* Close */}
      <button
        data-testid="search-close"
        onClick={onClose}
        aria-label="Close search (Escape)"
        className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors"
      >
        ✕
      </button>
    </div>
  )
}
