'use client'

import type { Clip } from '@/stores/timelineStore'
import { OverlayMediaEditor } from '@/components/editor/media/OverlayMediaEditor'

interface BrollMediaEditorProps {
  clip: Clip
  variant?: 'panel' | 'compact'
}

/** @deprecated Prefer OverlayMediaEditor with purpose="broll" */
export function BrollMediaEditor({ clip, variant = 'panel' }: BrollMediaEditorProps) {
  return <OverlayMediaEditor clip={clip} purpose="broll" variant={variant} />
}
