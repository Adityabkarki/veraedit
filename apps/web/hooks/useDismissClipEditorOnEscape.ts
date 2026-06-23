'use client'

import { useEffect } from 'react'
import { dismissClipEditorPanel } from '@/lib/clipEditorDismiss'

/** Press Escape to dismiss open clip editor panels. */
export function useDismissClipEditorOnEscape(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissClipEditorPanel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active])
}
