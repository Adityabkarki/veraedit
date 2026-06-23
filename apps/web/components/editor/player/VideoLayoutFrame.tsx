'use client'

/**
 * Composites the main video with split-screen or picture-in-picture layouts.
 */

import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useTimelineStore } from '@/stores/timelineStore'
import { usePlayerStore } from '@/stores/playerStore'
import { activeVideoLayout } from '@/lib/videoLayout'
import type { Clip } from '@/stores/timelineStore'

function SecondaryMedia({ clip }: { clip: Clip }) {
  const url = clip.effects?.mediaUrl
  const isImage =
    clip.effects?.mediaKind === 'image' ||
    (url ? /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url) : false)

  if (!url) {
    return (
      <div
        data-testid="layout-secondary-placeholder"
        className="w-full h-full flex flex-col items-center justify-center gap-2 bg-zinc-900/95 border border-dashed border-white/25 text-center px-4"
      >
        <span className="text-2xl opacity-60" aria-hidden="true">
          ▣
        </span>
        <p className="text-xs text-white/70 max-w-[12rem] leading-snug">
          Drop B-roll or an image on the timeline for the second panel
        </p>
      </div>
    )
  }

  if (isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className="w-full h-full object-cover" />
    )
  }

  return (
    <video
      src={url}
      className="w-full h-full object-cover"
      muted
      playsInline
      autoPlay
      loop
    />
  )
}

interface VideoLayoutFrameProps {
  children: ReactNode
}

export function VideoLayoutFrame({ children }: VideoLayoutFrameProps) {
  const clips = useTimelineStore((s) => s.clips)
  const currentTime = usePlayerStore((s) => s.currentTime)

  const layout = useMemo(
    () => activeVideoLayout(clips, currentTime),
    [clips, currentTime],
  )

  if (layout.mode === 'normal') {
    return <>{children}</>
  }

  if (layout.mode === 'split_screen') {
    return (
      <div
        data-testid="video-layout-split"
        className="relative w-full h-full flex overflow-hidden bg-black"
      >
        <div className="w-1/2 h-full overflow-hidden border-r border-white/20 relative">
          <div className="absolute inset-0 [&_video]:object-cover [&_video]:w-full [&_video]:h-full">
            {children}
          </div>
          <span className="absolute top-2 left-2 text-[10px] font-semibold uppercase tracking-wide text-white/80 bg-black/50 px-1.5 py-0.5 rounded pointer-events-none">
            Main
          </span>
        </div>
        <div className="w-1/2 h-full relative">
          {layout.secondaryClip ? (
            <SecondaryMedia clip={layout.secondaryClip} />
          ) : (
            <SecondaryMedia
              clip={{
                id: 'layout-placeholder',
                trackId: 'broll',
                startTime: 0,
                duration: 1,
                label: 'Second panel',
                type: 'overlay',
              }}
            />
          )}
          <span className="absolute top-2 left-2 text-[10px] font-semibold uppercase tracking-wide text-white/80 bg-black/50 px-1.5 py-0.5 rounded pointer-events-none">
            Second
          </span>
        </div>
      </div>
    )
  }

  const pipSize = `${Math.round(layout.pipScale * 100)}%`
  const cornerClass =
    layout.pipCorner === 'top-right'
      ? 'top-3 right-3'
      : layout.pipCorner === 'bottom-left'
        ? 'bottom-3 left-3'
        : layout.pipCorner === 'top-left'
          ? 'top-3 left-3'
          : 'bottom-3 right-3'

  return (
    <div data-testid="video-layout-pip" className="relative w-full h-full overflow-hidden">
      {children}
      <div
        className={`absolute ${cornerClass} overflow-hidden rounded-lg border-2 border-white/70 shadow-2xl bg-black z-10`}
        style={{ width: pipSize, aspectRatio: '16 / 9' }}
      >
        {layout.secondaryClip ? (
          <SecondaryMedia clip={layout.secondaryClip} />
        ) : (
          <SecondaryMedia
            clip={{
              id: 'pip-placeholder',
              trackId: 'broll',
              startTime: 0,
              duration: 1,
              label: 'PiP',
              type: 'overlay',
            }}
          />
        )}
      </div>
      <span className="absolute top-2 left-2 text-[10px] font-semibold uppercase tracking-wide text-white/80 bg-black/50 px-1.5 py-0.5 rounded pointer-events-none z-10">
        PiP layout
      </span>
    </div>
  )
}
