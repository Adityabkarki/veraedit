'use client'

/**
 * FindReplaceBar — search and replace within captions.
 *
 * - Supports Devanagari (the browser handles Unicode naturally)
 * - Case-sensitive toggle
 * - Shows match count
 * - "Replace All" replaces every occurrence across all captions
 */

import { useRef, useEffect } from 'react'
import { useCaptionsStore } from '@/stores/captionsStore'

interface FindReplaceBarProps {
  onClose: () => void
}

export function FindReplaceBar({ onClose }: FindReplaceBarProps) {
  const {
    searchQuery,
    replaceText,
    caseSensitive,
    searchMatchIds,
    setSearchQuery,
    setReplaceText,
    toggleCaseSensitive,
    replaceAll,
    captions,
  } = useCaptionsStore()

  const findRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    findRef.current?.focus()
    findRef.current?.select()
  }, [])

  const matchCount = searchMatchIds.length

  const handleFindKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter') {/* focus replace input */}
  }

  return (
    <div
      data-testid="find-replace-bar"
      className="flex flex-col gap-1.5 px-3 py-2.5 bg-bg-elevated border-b border-bg-overlay"
    >
      {/* Find row */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-bg-overlay border border-bg-overlay focus-within:border-accent transition-colors">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="text-text-disabled flex-shrink-0" aria-hidden="true">
            <circle cx="4.5" cy="4.5" r="3" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M7 7L9.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <input
            ref={findRef}
            data-testid="find-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleFindKeyDown}
            placeholder="Find in captions…"
            aria-label="Find text"
            className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-disabled outline-none"
          />
          {matchCount > 0 && (
            <span
              data-testid="find-match-count"
              className="text-[10px] text-text-disabled font-mono flex-shrink-0"
            >
              {matchCount} match{matchCount !== 1 ? 'es' : ''}
            </span>
          )}
          {searchQuery && matchCount === 0 && (
            <span className="text-[10px] text-status-error font-mono flex-shrink-0">0</span>
          )}
        </div>

        {/* Case-sensitive toggle */}
        <button
          data-testid="case-sensitive-toggle"
          onClick={toggleCaseSensitive}
          aria-pressed={caseSensitive}
          title="Case sensitive"
          className={[
            'w-7 h-7 rounded text-xs font-medium transition-colors flex-shrink-0',
            caseSensitive
              ? 'bg-accent text-white'
              : 'bg-bg-overlay text-text-secondary hover:text-text-primary',
          ].join(' ')}
        >
          Aa
        </button>

        {/* Close */}
        <button
          data-testid="find-replace-close"
          onClick={onClose}
          aria-label="Close find/replace"
          className="p-1 rounded text-text-disabled hover:text-text-secondary transition-colors flex-shrink-0"
        >
          ✕
        </button>
      </div>

      {/* Replace row */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-bg-overlay border border-bg-overlay focus-within:border-accent transition-colors">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="text-text-disabled flex-shrink-0" aria-hidden="true">
            <path d="M2 6C2 4 4 2 6 2M6 2L4 4M6 2L4 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M9 5C9 7 7 9 5 9M5 9L7 7M5 9L7 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <input
            data-testid="replace-input"
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="Replace with…"
            aria-label="Replace with"
            className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-disabled outline-none"
          />
        </div>

        <button
          data-testid="replace-all-button"
          onClick={replaceAll}
          disabled={!searchQuery.trim() || matchCount === 0}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-white
                     hover:bg-accent-glow transition-colors disabled:opacity-40
                     disabled:cursor-not-allowed flex-shrink-0"
        >
          Replace all
        </button>
      </div>
    </div>
  )
}
