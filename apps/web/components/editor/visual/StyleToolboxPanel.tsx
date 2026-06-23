'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchStyleToolbox, type EditToolboxTool } from '@/lib/styleTransfer'
import { insertStyleToolAt } from '@/lib/styleToolboxSync'
import { useTimelineStore } from '@/stores/timelineStore'

const CATEGORY_LABELS: Record<string, string> = {
  captions: 'Captions',
  pacing: 'Pacing & cuts',
  shot: 'Shot type',
  camera: 'Camera & zoom',
  transitions: 'Transitions',
  color: 'Color',
  vfx: 'VFX',
  motion: 'Motion graphics',
  overlays: 'On-screen overlays',
  broll: 'B-roll',
  audio: 'Audio',
  layout: 'Layout',
}

const STATUS_STYLES: Record<string, string> = {
  supported: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  partial: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  missing: 'bg-zinc-500/15 text-text-disabled border-zinc-500/40',
}

interface StyleToolboxPanelProps {
  projectId: string
  /** Highlight tools used by the selected preset */
  activeToolIds?: string[]
  refreshKey?: number
}

export function StyleToolboxPanel({
  projectId,
  activeToolIds = [],
  refreshKey = 0,
}: StyleToolboxPanelProps) {
  const [tools, setTools] = useState<EditToolboxTool[]>([])
  const [discoveredCount, setDiscoveredCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'discovered' | 'active'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetchStyleToolbox(projectId)
    if (res.data) {
      setTools(res.data.tools)
      setDiscoveredCount(res.data.discovered_count)
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const activeSet = new Set(activeToolIds)
  const shown = tools.filter((t) => {
    if (filter === 'discovered') return t.discovered
    if (filter === 'active') return activeSet.has(t.id)
    return true
  })

  const grouped = shown.reduce<Record<string, EditToolboxTool[]>>((acc, t) => {
    const cat = t.category || 'overlays'
    acc[cat] = acc[cat] ?? []
    acc[cat].push(t)
    return acc
  }, {})

  return (
    <div
      data-testid="style-toolbox-panel"
      className="rounded-lg border border-bg-overlay bg-bg-elevated/50 p-3 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-text-primary">Edit toolbox</p>
          <p className="text-[10px] text-text-secondary leading-relaxed mt-0.5">
            Drag any tool onto the timeline, or click + to insert at the playhead.
          </p>
        </div>
        <span className="text-[10px] text-text-disabled whitespace-nowrap">
          {discoveredCount}/{tools.length} unlocked
        </span>
      </div>

      <div className="flex gap-1 flex-wrap">
        {(['all', 'discovered', 'active'] as const).map((f) => (
          <button
            key={f}
            type="button"
            data-testid={`toolbox-filter-${f}`}
            onClick={() => setFilter(f)}
            className={`px-2 py-0.5 rounded text-[10px] border ${
              filter === f
                ? 'border-accent text-accent bg-accent/10'
                : 'border-bg-overlay text-text-disabled hover:text-text-secondary'
            }`}
          >
            {f === 'all' ? 'All' : f === 'discovered' ? 'Unlocked' : 'In template'}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-[11px] text-text-disabled">Loading toolbox…</p>
      )}

      {!loading && shown.length === 0 && (
        <p className="text-[11px] text-text-secondary">
          Extract a reference video to unlock editing tools in your toolbox.
        </p>
      )}

      {!loading &&
        Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled mb-1.5">
              {CATEGORY_LABELS[cat] ?? cat}
            </p>
            <ul className="space-y-1">
              {items.map((tool) => {
                const inTemplate = activeSet.has(tool.id)
                return (
                  <li
                    key={tool.id}
                    data-testid={`toolbox-item-${tool.id}`}
                    draggable={tool.discovered}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        'text/plain',
                        JSON.stringify({
                          type: 'style-tool',
                          toolId: tool.id,
                          toolName: tool.name,
                          category: tool.category,
                        }),
                      )
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 border text-[11px] ${
                      tool.discovered
                        ? 'border-bg-overlay bg-bg-base/40 cursor-grab active:cursor-grabbing'
                        : 'border-dashed border-bg-overlay opacity-60'
                    } ${inTemplate ? 'ring-1 ring-accent/40' : ''}`}
                  >
                    <span
                      className={`shrink-0 px-1 py-0.5 rounded border text-[9px] uppercase ${
                        STATUS_STYLES[tool.status] ?? STATUS_STYLES.missing
                      }`}
                    >
                      {tool.status === 'supported' ? 'Ready' : tool.status}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="font-medium text-text-primary">{tool.name}</span>
                      {tool.description && (
                        <span className="block text-text-disabled truncate">{tool.description}</span>
                      )}
                    </span>
                    {tool.discovered && (
                      <span className="text-[9px] text-emerald-500/90 shrink-0">Unlocked</span>
                    )}
                    {inTemplate && (
                      <span className="text-[9px] text-accent shrink-0">In template</span>
                    )}
                    {tool.discovered && (
                      <button
                        type="button"
                        data-testid={`toolbox-insert-${tool.id}`}
                        title="Insert at playhead"
                        onClick={() => {
                          const t = useTimelineStore.getState().playheadTime
                          insertStyleToolAt(tool.id, tool.name, t)
                        }}
                        className="shrink-0 px-1 py-0.5 rounded text-[9px] font-medium text-accent hover:bg-accent/10"
                      >
                        +
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
    </div>
  )
}
