'use client'

/**
 * EffectsRightPanel — effects browser in the editor right column.
 */

import { useEffect } from 'react'
import { EffectsPanel } from '@/components/editor/effects/EffectsPanel'
import { useEffectsStore } from '@/stores/effectsStore'
import { useUIStore } from '@/stores/uiStore'

interface EffectsRightPanelProps {
  projectId?: string
}

export function EffectsRightPanel({ projectId }: EffectsRightPanelProps) {
  const closeDrawer = useEffectsStore((s) => s.closeDrawer)

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer()
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [closeDrawer])

  const handleClose = () => {
    closeDrawer()
    useUIStore.getState().setRightPanelMode('ai')
  }

  return (
    <div data-testid="effects-right-panel" className="h-full min-h-0 flex flex-col overflow-hidden">
      <EffectsPanel projectId={projectId} onClose={handleClose} />
    </div>
  )
}
