'use client'

/**
 * TemplatesTab — grid of visual templates with category filters and
 * English ↔ Nepali language toggle.
 */

import { useVisualLibraryStore, TEMPLATE_CATEGORIES } from '@/stores/visualLibraryStore'
import { TemplateCard } from '@/components/editor/visual/TemplateCard'

export function TemplatesTab() {
  const {
    activeCategory,
    contentLanguage,
    searchQuery,
    setActiveCategory,
    setContentLanguage,
    setSearchQuery,
    filteredTemplates,
    placedOverlays,
  } = useVisualLibraryStore()

  const templates = filteredTemplates()

  return (
    <div data-testid="templates-tab" className="flex flex-col h-full overflow-hidden">
      {/* Search + language toggle */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-bg-overlay flex-shrink-0">
        <input
          data-testid="template-search"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search templates…"
          className="flex-1 bg-bg-overlay rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-disabled outline-none focus:ring-1 focus:ring-accent"
        />

        {/* Language toggle */}
        <div
          data-testid="language-toggle"
          className="flex rounded-lg overflow-hidden border border-bg-overlay flex-shrink-0"
        >
          <button
            data-testid="lang-en"
            onClick={() => setContentLanguage('en')}
            aria-pressed={contentLanguage === 'en'}
            className={[
              'px-2 py-1 text-[10px] font-medium transition-colors',
              contentLanguage === 'en'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            EN
          </button>
          <button
            data-testid="lang-ne"
            onClick={() => setContentLanguage('ne')}
            aria-pressed={contentLanguage === 'ne'}
            className={[
              'px-2 py-1 text-[10px] font-medium transition-colors',
              contentLanguage === 'ne'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            🇳🇵
          </button>
        </div>
      </div>

      {/* Category filters */}
      <div className="flex gap-1 flex-wrap px-3 py-2 border-b border-bg-overlay flex-shrink-0">
        {TEMPLATE_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            data-testid={`cat-filter-${cat.id}`}
            onClick={() => setActiveCategory(cat.id as any)}
            aria-pressed={activeCategory === cat.id}
            className={[
              'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
              activeCategory === cat.id
                ? 'bg-accent text-white'
                : 'bg-bg-overlay text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Template grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {templates.length === 0 ? (
          <p className="text-sm text-text-secondary text-center py-8">
            No templates match your search.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                language={contentLanguage}
              />
            ))}
          </div>
        )}
      </div>

      {/* Placed count */}
      {placedOverlays.length > 0 && (
        <div className="px-3 py-2 border-t border-bg-overlay flex-shrink-0">
          <p className="text-[11px] text-text-disabled text-center">
            {placedOverlays.length} template{placedOverlays.length !== 1 ? 's' : ''} placed on timeline
          </p>
        </div>
      )}
    </div>
  )
}
