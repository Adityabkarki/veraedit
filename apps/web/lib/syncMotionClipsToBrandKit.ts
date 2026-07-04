/**
 * Push current Brand Kit colors onto timeline motion-graphic clips (for export + edit panel).
 */
import type { BrandKit } from '@/stores/visualLibraryStore'
import { useTimelineStore, type Clip } from '@/stores/timelineStore'
import { isMotionGraphicProType } from '@/lib/motionGraphicsLibrary'
import { resolveBrandKitTheme } from '@/lib/brandKitTheme'

function isMotionOverlayClip(clip: Clip): boolean {
  if (clip.type !== 'overlay') return false
  const vt = String(clip.effects?.visualType ?? '').toLowerCase()
  return isMotionGraphicProType(vt)
}

/** Update all motion-graphic clips on the timeline to match the Brand Kit. */
export function syncMotionClipsToBrandKit(brandKit: BrandKit): number {
  const theme = resolveBrandKitTheme(brandKit)
  let updated = 0

  useTimelineStore.setState((state) => ({
    clips: state.clips.map((clip) => {
      if (!isMotionOverlayClip(clip)) return clip
      updated += 1
      const motionProps = {
        ...((clip.effects?.motionProps as Record<string, unknown>) ?? {}),
        brandColor: theme.colors.primary,
        accentColor: theme.colors.accent,
      }
      return {
        ...clip,
        effects: {
          ...clip.effects,
          brandColor: theme.colors.primary,
          motionProps,
          motionTheme: theme,
        },
      }
    }),
  }))

  return updated
}
