'use client'

/**
 * EditToolboxTab — unified catalog (toolbox + filters/transitions/text/speed, deduplicated).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchEditToolbox, type EditToolboxTool } from '@/lib/styleTransfer'
import { EditToolboxTile } from '@/components/editor/effects/EditToolboxTile'
import { useEffectsStore } from '@/stores/effectsStore'
import {
  applyCatalogItem,
  buildUnifiedCatalog,
  catalogItemMatchesSearch,
  normalizeCatalogCategory,
  UNIFIED_CATEGORY_LABELS,
  UNIFIED_CATEGORY_ORDER,
  type CatalogItem,
} from '@/lib/effectsCatalog'

interface EditToolboxTabProps {
  projectId?: string
  /** When true, merge legacy preset tabs into one catalog */
  unified?: boolean
}

function catalogToTool(item: CatalogItem): EditToolboxTool {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    description: item.description ?? '',
    available: item.available,
    discovered: item.available,
    status: 'supported',
    renderer: item.source,
  }
}

export function EditToolboxTab({ projectId, unified = false }: EditToolboxTabProps) {
  const [tools, setTools] = useState<EditToolboxTool[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const searchQuery = useEffectsStore((s) => s.searchQuery)
  const clearLastApplied = useEffectsStore((s) => s.clearLastApplied)
  const insertChartsAsBroll = useEffectsStore((s) => s.insertChartsAsBroll)
  const setInsertChartsAsBroll = useEffectsStore((s) => s.setInsertChartsAsBroll)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetchEditToolbox(projectId)
    if (res.data?.tools) setTools(res.data.tools)
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  const catalog = useMemo(
    () => (unified ? buildUnifiedCatalog(tools) : tools.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      description: t.description,
      available: t.available || t.discovered,
      source: 'toolbox' as const,
    }))),
    [tools, unified],
  )

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return catalog.filter((item) => {
      if (!item.available) return false
      if (
        activeCategory !== 'all' &&
        normalizeCatalogCategory(item.category) !== activeCategory
      ) {
        return false
      }
      return catalogItemMatchesSearch(item, q)
    })
  }, [catalog, searchQuery, activeCategory])

  const categories = useMemo(() => {
    const cats = new Set(
      catalog
        .filter((c) => c.available)
        .map((c) => normalizeCatalogCategory(c.category)),
    )
    return UNIFIED_CATEGORY_ORDER.filter((c) => cats.has(c))
  }, [catalog])

  const applyItem = (item: CatalogItem) => {
    if (unified) {
      applyCatalogItem(item)
    } else {
      applyCatalogItem({ ...item, source: 'toolbox' })
    }
    setTimeout(() => clearLastApplied(), 2000)
  }

  if (loading) {
    return <p className="p-4 text-xs text-text-disabled">Loading edit elements…</p>
  }

  return (
    <div data-testid="edit-toolbox-tab" className="flex flex-col">
      <div className="px-3 py-2 border-b border-bg-overlay">
        <p className="text-[10px] text-text-secondary leading-relaxed">
          Layers stack automatically when they overlap. Select any clip on the timeline to edit its
          In / Out timestamps below the tracks.
        </p>
      </div>

      {(activeCategory === 'charts' || activeCategory === 'all') && (
        <div
          className="px-3 py-2 border-b border-bg-overlay flex items-center gap-2"
          data-testid="charts-broll-toggle-row"
        >
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              data-testid="charts-insert-as-broll"
              checked={insertChartsAsBroll}
              onChange={(e) => setInsertChartsAsBroll(e.target.checked)}
              className="accent-accent rounded"
            />
            <span className="text-[11px] text-text-secondary">
              Add as B-Roll <span className="text-text-disabled">(full-screen over video)</span>
            </span>
          </label>
        </div>
      )}

      <div className="px-3 py-2 flex gap-1 flex-wrap border-b border-bg-overlay overflow-x-auto">
        <button
          type="button"
          data-testid="toolbox-cat-all"
          onClick={() => setActiveCategory('all')}
          className={`px-2 py-0.5 rounded text-[10px] border shrink-0 ${
            activeCategory === 'all' ? 'border-accent text-accent bg-accent/10' : 'border-bg-overlay text-text-disabled'
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            data-testid={`toolbox-cat-${cat}`}
            onClick={() => setActiveCategory(cat)}
            className={`px-2 py-0.5 rounded text-[10px] border shrink-0 ${
              activeCategory === cat ? 'border-accent text-accent bg-accent/10' : 'border-bg-overlay text-text-disabled'
            }`}
          >
            {UNIFIED_CATEGORY_LABELS[cat] ?? cat}
          </button>
        ))}
      </div>

      <div className="p-3">
        {filtered.length === 0 ? (
          <p className="text-xs text-text-disabled text-center py-6">No elements match your search.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {filtered.map((item) => (
              <EditToolboxTile
                key={item.id}
                tool={catalogToTool(item)}
                onApply={() => applyItem(item)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
