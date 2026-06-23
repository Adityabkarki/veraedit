'use client'

/**
 * ShortCardVideoPreview — plays the short's exact segment inside the card (9:16).
 * Click to play/pause; stops automatically at endTime.
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { useShortsStore } from '@/stores/shortsStore'
import { shortPreviewObjectPosition, shortPreviewScale } from '@/lib/shortFraming'
import type { ShortFraming } from '@/lib/shortFraming'
import {
  shortVideoCssFilter,
  shortPlaybackRate,
  type ShortStyling,
} from '@/lib/shortStyling'
import { ShortOverlayLayer } from '@/components/editor/shorts/ShortOverlayLayer'

interface ShortCardVideoPreviewProps {
  shortId:          string
  videoUrl:         string | null
  startTime:        number
  endTime:          number
  duration:         number
  placeholderColor: string
  framing:          ShortFraming
  styling:          ShortStyling
  segments?:        { startTime: number; endTime: number }[]
  onLoadError?:     (message: string) => void
}

function formatDuration(s: number): string {
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export function ShortCardVideoPreview({
  shortId,
  videoUrl,
  startTime,
  endTime,
  duration,
  placeholderColor,
  framing,
  styling,
  segments,
  onLoadError,
}: ShortCardVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const segmentIndexRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [clipProgress, setClipProgress] = useState(0)
  const [localTime, setLocalTime] = useState(0)

  const playbackSegments = segments && segments.length > 1
    ? segments
    : [{ startTime, endTime }]

  const totalSpan = playbackSegments.reduce((sum, s) => sum + (s.endTime - s.startTime), 0)

  const activePreviewId = useShortsStore((s) => s.activePreviewId)
  const setActivePreviewId = useShortsStore((s) => s.setActivePreviewId)

  const pause = useCallback(() => {
    const vid = videoRef.current
    if (vid) vid.pause()
    setPlaying(false)
  }, [])

  // Pause when another card starts playing
  useEffect(() => {
    if (activePreviewId !== null && activePreviewId !== shortId) {
      pause()
    }
  }, [activePreviewId, shortId, pause])

  const seekAndPlay = useCallback(() => {
    const vid = videoRef.current
    if (!vid || !videoUrl) return

    const run = () => {
      segmentIndexRef.current = 0
      vid.currentTime = playbackSegments[0].startTime
      setPlaying(true)
      setActivePreviewId(shortId)
      void vid.play().catch(() => {
        pause()
        setActivePreviewId(null)
        onLoadError?.('Could not play this clip. Check your connection and try again.')
      })
    }

    if (vid.readyState >= 1) run()
    else vid.addEventListener('loadedmetadata', run, { once: true })
  }, [videoUrl, playbackSegments, shortId, setActivePreviewId, pause, onLoadError])

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!videoUrl) {
        onLoadError?.('Video is still loading. Wait a moment and try again.')
        return
      }
      if (playing) {
        pause()
        setActivePreviewId(null)
        return
      }
      seekAndPlay()
    },
    [videoUrl, playing, pause, setActivePreviewId, seekAndPlay, onLoadError],
  )

  const onTimeUpdate = useCallback(() => {
    const vid = videoRef.current
    if (!vid) return
    const idx = segmentIndexRef.current
    const seg = playbackSegments[idx]
    const local = Math.max(0, vid.currentTime - seg.startTime)

    let elapsedBefore = 0
    for (let i = 0; i < idx; i++) {
      elapsedBefore += playbackSegments[i].endTime - playbackSegments[i].startTime
    }
    const globalLocal = elapsedBefore + local
    setLocalTime(globalLocal)
    setClipProgress(Math.min(1, globalLocal / Math.max(0.1, totalSpan)))

    if (vid.currentTime >= seg.endTime) {
      if (idx + 1 < playbackSegments.length) {
        segmentIndexRef.current = idx + 1
        vid.currentTime = playbackSegments[idx + 1].startTime
        return
      }
      vid.pause()
      vid.currentTime = playbackSegments[0].startTime
      segmentIndexRef.current = 0
      setPlaying(false)
      setClipProgress(0)
      setLocalTime(0)
      setActivePreviewId(null)
    }
  }, [playbackSegments, totalSpan, setActivePreviewId])

  const previewScale = shortPreviewScale(framing.reframeStrategy)
  const objectPosition = shortPreviewObjectPosition(framing.panX)
  const cssFilter = shortVideoCssFilter(styling.filterId)
  const playbackRate = shortPlaybackRate(styling.speedId)

  useEffect(() => {
    const vid = videoRef.current
    if (vid) vid.playbackRate = playbackRate
  }, [playbackRate, videoUrl])

  return (
    <div
      className="relative cursor-pointer group w-full h-full"
      style={{ aspectRatio: '9/16', background: videoUrl ? '#000' : placeholderColor }}
      onClick={handleToggle}
      data-testid={`short-thumbnail-${shortId}`}
      role="button"
      aria-label={playing ? 'Pause short preview' : 'Play short preview'}
    >
      {videoUrl ? (
        <video
          ref={videoRef}
          src={videoUrl}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            objectPosition,
            transform: previewScale !== 1 ? `scale(${previewScale})` : undefined,
            transformOrigin: objectPosition,
            filter: cssFilter,
          }}
          playsInline
          preload="metadata"
          onTimeUpdate={onTimeUpdate}
          data-testid={`short-card-video-${shortId}`}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center text-white/40"
          aria-hidden="true"
        >
          <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 2L14 8L4 14V2Z"/>
          </svg>
        </div>
      )}

      <ShortOverlayLayer styling={styling} localTime={localTime} />

      {/* Play / pause overlay */}
      <div
        className={[
          'absolute inset-0 flex items-center justify-center transition-colors',
          playing ? 'bg-black/10' : 'bg-black/0 group-hover:bg-black/30',
        ].join(' ')}
      >
        {!playing && (
          <div className="w-10 h-10 rounded-full bg-white/20 group-hover:bg-white/40 flex items-center justify-center transition-all">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="white" aria-hidden="true">
              <path d="M4 2L14 8L4 14V2Z"/>
            </svg>
          </div>
        )}
      </div>

      {/* Clip progress (within short segment only) */}
      {videoUrl && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/40">
          <div
            className="h-full bg-accent transition-[width] duration-100"
            style={{ width: `${clipProgress * 100}%` }}
            data-testid={`short-preview-progress-${shortId}`}
          />
        </div>
      )}

      {/* Duration chip */}
      <div className="absolute bottom-2 left-2 bg-black/70 rounded px-1.5 py-0.5 text-[10px] font-mono text-white pointer-events-none">
        {formatDuration(duration)}
      </div>
    </div>
  )
}
