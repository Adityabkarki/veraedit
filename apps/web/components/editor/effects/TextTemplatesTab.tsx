'use client'

/**
 * TextTemplatesTab — text overlay template presets.
 *
 * 16 presets across 5 categories (Lower Third / Title / Quote / Stat / CTA).
 * Nepali-ready templates are marked with 🇳🇵 and use font-nepali.
 * Clicking inserts the overlay at the playhead position.
 */

import { useEffectsStore, TEXT_TEMPLATES } from '@/stores/effectsStore'

const CATEGORY_LABELS: Record<string, string> = {
  'lower-third': 'Lower Thirds',
  'title':       'Title Cards',
  'quote':       'Quotes',
  'stat':        'Statistics',
  'cta':         'Call to Action',
}

const CATEGORY_ORDER = ['lower-third', 'title', 'quote', 'stat', 'cta']

export function TextTemplatesTab() {
  const { filteredTextTemplates, recentlyUsed, applyEffect } = useEffectsStore()
  const templates = filteredTextTemplates()

  // Group by category
  const grouped: Record<string, typeof templates> = {}
  for (const t of templates) {
    if (!grouped[t.category]) grouped[t.category] = []
    grouped[t.category].push(t)
  }

  return (
    <div data-testid="text-templates-tab" className="flex flex-col gap-4 p-3">
      {CATEGORY_ORDER.filter((cat) => grouped[cat]?.length).map((cat) => (
        <div key={cat}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled mb-2">
            {CATEGORY_LABELS[cat]}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {grouped[cat].map((t) => {
              const isRecent = recentlyUsed.includes(t.id)
              return (
                <button
                  key={t.id}
                  data-testid={`text-template-tile-${t.id}`}
                  onClick={() => applyEffect(t.id)}
                  title={t.name}
                  aria-label={`Apply ${t.name} template`}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  {/* Preview card */}
                  <div
                    className="w-full rounded-lg border-2 border-transparent
                               group-hover:border-accent transition-colors overflow-hidden
                               flex items-end pb-2 px-2 relative"
                    style={{ background: t.previewColor, aspectRatio: '16/9' }}
                  >
                    {/* Text overlay preview */}
                    <div className="absolute bottom-2 left-2 right-2">
                      <div
                        className={[
                          'px-1.5 py-0.5 rounded text-center text-[8px] font-semibold truncate',
                          t.style === 'bold'      ? 'bg-white text-gray-900' :
                          t.style === 'minimal'   ? 'bg-black/50 text-white border border-white/30' :
                          t.style === 'corporate' ? 'bg-blue-900/80 text-white' :
                          'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
                          t.nepaliReady ? 'font-nepali' : '',
                        ].join(' ')}
                      >
                        {t.previewText.length > 14 ? t.previewText.slice(0, 13) + '…' : t.previewText}
                      </div>
                    </div>
                    {/* Badges */}
                    {isRecent && (
                      <span className="absolute top-1 left-1 text-[9px] text-accent font-bold">★</span>
                    )}
                    {t.nepaliReady && (
                      <span
                        data-testid={`nepali-badge-${t.id}`}
                        className="absolute top-1 right-1 text-[8px]"
                        title="Supports Nepali (Devanagari)"
                      >
                        🇳🇵
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-text-secondary group-hover:text-text-primary transition-colors text-center leading-tight">
                    {t.name}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {templates.length === 0 && (
        <p className="text-sm text-text-secondary text-center py-8">
          No templates match your search.
        </p>
      )}

      <p className="text-[10px] text-text-disabled text-center pb-2 mt-auto">
        🇳🇵 = Supports Devanagari (Nepali)
      </p>
    </div>
  )
}
