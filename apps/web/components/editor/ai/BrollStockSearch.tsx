'use client'

import { useState } from 'react'
import { api } from '@/lib/api'

interface StockResult {
  id: number
  duration: number
  thumbnail_url: string
  video_url: string
  width: number
  height: number
  provider: string
}

interface BrollStockSearchProps {
  suggestionId: string | null
  initialQuery: string
  projectId: string
  onSelect: (suggestionId: string | null, stockUrl: string, prompt: string) => void
  onClose: () => void
}

export function BrollStockSearch({
  suggestionId,
  initialQuery,
  projectId,
  onSelect,
  onClose,
}: BrollStockSearchProps) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<StockResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    setResults([])

    const res = await api.post<{
      status: string
      count: number
      results: StockResult[]
    }>(`/projects/${projectId}/broll/search-stock`, {
      query: query.trim(),
      count: 8,
      orientation: 'landscape',
    })

    if (res.error) {
      setError(res.error)
    } else if (res.data?.results) {
      setResults(res.data.results)
      if (res.data.results.length === 0) {
        setError('No results found. Try a different search term.')
      }
    }
    setSearching(false)
  }

  const handleSelect = (r: StockResult) => {
    setSelectedId(r.id)
    onSelect(suggestionId, r.video_url, query.trim())
  }

  const formatDuration = (s: number): string => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-bg-surface rounded-xl border border-bg-overlay shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-bg-overlay flex-shrink-0">
          <h3 className="text-sm font-semibold text-text-primary">
            Search Stock Footage
          </h3>
          <button
            onClick={onClose}
            className="text-text-disabled hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Search bar */}
        <div className="px-5 py-3 border-b border-bg-overlay flex-shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Describe the B-roll you need..."
              className="flex-1 px-3 py-1.5 rounded-lg bg-bg-elevated border border-bg-overlay text-xs text-text-primary placeholder:text-text-disabled outline-none focus:border-accent/50 transition-colors"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {error && (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
              <p className="text-xs text-text-secondary">{error}</p>
            </div>
          )}

          {searching && results.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3 text-text-disabled">
                <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm">Searching stock footage...</span>
              </div>
            </div>
          )}

          {!searching && results.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
              <div className="w-10 h-10 rounded-full bg-bg-overlay flex items-center justify-center text-text-disabled">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <rect x="2" y="3" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
                  <path d="M7 7L11 9L7 11V7Z" fill="currentColor" opacity="0.6" />
                </svg>
              </div>
              <p className="text-xs text-text-secondary">Enter a search term to find stock footage</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {results.map((r) => (
                <div
                  key={r.id}
                  className={`relative rounded-lg overflow-hidden border cursor-pointer transition-all group ${
                    selectedId === r.id
                      ? 'border-accent ring-2 ring-accent/30'
                      : 'border-bg-overlay hover:border-accent/50'
                  }`}
                  onClick={() => handleSelect(r)}
                >
                  <div className="aspect-video bg-bg-elevated relative">
                    <img
                      src={r.thumbnail_url}
                      alt={`Stock ${r.id}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {/* Duration badge */}
                    <span className="absolute bottom-1.5 right-1.5 text-[10px] font-mono bg-black/70 text-white px-1.5 py-0.5 rounded">
                      {formatDuration(r.duration)}
                    </span>
                    {/* Resolution badge */}
                    <span className="absolute top-1.5 left-1.5 text-[10px] font-mono bg-black/70 text-white px-1.5 py-0.5 rounded">
                      {r.width}x{r.height}
                    </span>
                    {/* Provider badge */}
                    <span className="absolute top-1.5 right-1.5 text-[10px] font-medium bg-black/70 text-white px-1.5 py-0.5 rounded">
                      {r.provider}
                    </span>
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-accent/0 group-hover:bg-accent/10 transition-colors" />
                  </div>
                  <div className="px-2.5 py-2">
                    <button
                      disabled={selectedId === r.id}
                      className={`w-full text-[11px] font-medium py-1 rounded transition-colors ${
                        selectedId === r.id
                          ? 'bg-accent/10 text-accent cursor-default'
                          : 'bg-accent text-white hover:bg-accent/90'
                      }`}
                    >
                      {selectedId === r.id ? 'Selected ✓' : 'Use This'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-bg-overlay flex items-center justify-between">
          <p className="text-[11px] text-text-disabled">
            {results.length > 0
              ? `${results.length} result${results.length !== 1 ? 's' : ''} from Pexels`
              : 'Powered by Pexels'}
          </p>
          <button
            onClick={onClose}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
