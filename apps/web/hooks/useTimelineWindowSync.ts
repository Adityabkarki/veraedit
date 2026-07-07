'use client'

/**
 * Keeps the NLE viewport window in sync on scroll/zoom (Phase 15).
 * Fetches Director timeline slices when a director timeline id is set.
 */
import { useEffect, useRef } from 'react'
import { useTimelineStore } from '@/stores/timelineStore'

export function useTimelineWindowSync(
  scrollContainerRef: React.RefObject<HTMLElement | null>,
): void {
  const longFormMode = useTimelineStore((s) => s.longFormMode)
  const scrollX = useTimelineStore((s) => s.scrollX)
  const pixelsPerSecond = useTimelineStore((s) => s.pixelsPerSecond)
  const directorTimelineId = useTimelineStore((s) => s.directorTimelineId)
  const refreshVisibleWindow = useTimelineStore((s) => s.refreshVisibleWindow)
  const syncDirectorWindow = useTimelineStore((s) => s.syncDirectorWindow)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!longFormMode) return
    const viewportWidth = scrollContainerRef.current?.clientWidth ?? 1200
    refreshVisibleWindow(viewportWidth)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (directorTimelineId) {
        void syncDirectorWindow(viewportWidth)
      }
    }, 150)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [
    longFormMode,
    scrollX,
    pixelsPerSecond,
    directorTimelineId,
    scrollContainerRef,
    refreshVisibleWindow,
    syncDirectorWindow,
  ])

  useEffect(() => {
    if (!longFormMode) return
    const el = scrollContainerRef.current
    if (!el) return
    const onResize = () => refreshVisibleWindow(el.clientWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [longFormMode, scrollContainerRef, refreshVisibleWindow])
}
