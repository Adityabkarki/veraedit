'use client'

import { Copy, Lock, EyeOff, ArrowUp, ArrowDown, Trash2, Eye, Unlock } from 'lucide-react'
import { useImageLayer } from '@/stores/imageLayerStore'
import { useImageLayerStore } from '@/stores/imageLayerStore'
import { cn } from '@/lib/utils'

export function LayerActionsSection({ layerId }: { layerId: string }) {
  const layer = useImageLayer(layerId)
  const { duplicateLayer, removeLayer, bringForward, sendBackward, updateLayer } =
    useImageLayerStore()

  if (!layer) return null

  const quickActions = [
    {
      icon: <Copy size={13} />,
      label: 'Duplicate',
      onClick: () => duplicateLayer(layerId),
    },
    {
      icon: layer.locked ? <Unlock size={13} /> : <Lock size={13} />,
      label: layer.locked ? 'Unlock' : 'Lock',
      onClick: () => updateLayer(layerId, { locked: !layer.locked }),
      active: layer.locked,
    },
    {
      icon: layer.visible ? <EyeOff size={13} /> : <Eye size={13} />,
      label: layer.visible ? 'Hide' : 'Show',
      onClick: () => updateLayer(layerId, { visible: !layer.visible }),
      active: !layer.visible,
    },
    {
      icon: <ArrowUp size={13} />,
      label: 'Forward',
      onClick: () => bringForward(layerId),
    },
    {
      icon: <ArrowDown size={13} />,
      label: 'Back',
      onClick: () => sendBackward(layerId),
    },
  ]

  return (
    <div className="px-4 py-3 border-t border-bg-overlay">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {quickActions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className={cn(
              'flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-bg-overlay',
              'hover:bg-bg-overlay/50 transition-colors',
              a.active && 'bg-accent/10 text-accent border-accent/30',
            )}
          >
            {a.icon}
            <span>{a.label}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        data-testid="image-remove-layer"
        onClick={() => removeLayer(layerId)}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-md border
                   border-status-error/30 text-status-error text-xs hover:bg-status-error/5 transition-colors"
      >
        <Trash2 size={13} />
        Remove from timeline
      </button>
    </div>
  )
}
