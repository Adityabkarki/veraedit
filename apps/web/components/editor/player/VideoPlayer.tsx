'use client'

/**
 * VideoPlayer — HTML5 video element + all playback controls.
 *
 * Syncs bidirectionally with:
 *   – playerStore (play/pause/seek/volume/speed/captions)
 *   – timelineStore (playhead follows currentTime; timeline clicks seek player)
 *
 * When no `src` is provided, renders a placeholder canvas.
 * When a src is provided (EP-4.6+), it drives real playback.
 *
 * Caption overlay uses Noto Sans Devanagari (font-nepali) — only for
 * video content, never for UI chrome.
 */

import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import { usePlayerStore } from '@/stores/playerStore'
import { useTimelineStore }               from '@/stores/timelineStore'
import { CaptionOverlay }    from '@/components/editor/player/CaptionOverlay'
import { VisualOverlayLayer } from '@/components/editor/player/VisualOverlayLayer'
import { VideoLayoutFrame } from '@/components/editor/player/VideoLayoutFrame'
import { SpeedControl }                   from '@/components/editor/player/SpeedControl'
import { useCaptionsStore } from '@/stores/captionsStore'
import {
  activeVideoClipAt,
  clipPreviewFilter,
  clipPreviewOpacity,
  clipPreviewScale,
  clipPlaybackMultiplier,
} from '@/lib/applyEffects'
import {
  timelineToSourceTime,
  sourceTimeToTimeline,
  timelineVideoDuration,
  advanceSourceAtClipBoundary,
} from '@/lib/playbackMapping'
import { activeVignetteStrength } from '@/lib/effectKeyframes'
import { playStyleTransferSfx } from '@/lib/styleTransferSfx'
import { BrollPreviewUpload } from '@/components/editor/player/BrollPreviewUpload'
import {
  DirectorRemotionPreview,
  useUnifiedRenderPreviewActive,
} from '@/components/editor/player/DirectorRemotionPreview'

interface VideoPlayerProps {
  src?: string
  aspectRatio?: string
  projectId?: string
}

const ASPECT_MAP: Record<string, string> = {
  '16:9': '16 / 9',
  '9:16': '9 / 16',
  '1:1':  '1 / 1',
  '4:3':  '4 / 3',
  '21:9': '21 / 9',
}

function formatTime(s: number): string {
  const t  = Math.max(0, s)
  const m  = Math.floor(t / 60)
  const ss = Math.floor(t % 60)
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

export function VideoPlayer({ src, aspectRatio, projectId }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const syncingFromVideo = useRef(false)
  const playedSfxRef = useRef<Set<string>>(new Set())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const wantsUnifiedPreview = useUnifiedRenderPreviewActive() && Boolean(projectId)
  const [remotionOverlayReady, setRemotionOverlayReady] = useState(false)

  const handleRemotionReady = useCallback(() => {
    setRemotionOverlayReady(true)
  }, [])

  const handleRemotionFailed = useCallback(() => {
    setRemotionOverlayReady(false)
  }, [])

  const {
    isPlaying, currentTime, duration, volume, muted, playbackRate, previewEnd,
    previewNonce, previewStart,
    play, pause, togglePlay, seek, setDuration, setCurrentTime,
    setVolume, toggleMute, setActiveCaptionText, clearPreviewRange,
  } = usePlayerStore()

  const captions = useCaptionsStore((s) => s.captions)
  const clips = useTimelineStore((s) => s.clips)

  const { playheadTime, setPlayheadTime } = useTimelineStore()

  useEffect(() => {
    setRemotionOverlayReady(false)
  }, [projectId, src, clips.length])

  const overlayRemotion = wantsUnifiedPreview && remotionOverlayReady
  const hideHtmlVideo = overlayRemotion

  const timelineDuration = useMemo(
    () => timelineVideoDuration(clips) || duration,
    [clips, duration],
  )

  useEffect(() => {
    const td = timelineVideoDuration(clips)
    if (td > 0) setDuration(td)
  }, [clips, setDuration])

  const activeVideoClip = useMemo(
    () => activeVideoClipAt(clips, currentTime),
    [clips, currentTime],
  )
  const videoFilter = clipPreviewFilter(activeVideoClip, clips, currentTime)
  const videoOpacity = clipPreviewOpacity(activeVideoClip, currentTime, clips)
  const videoScale = clipPreviewScale(activeVideoClip, currentTime, clips)
  const clipSpeed = clipPlaybackMultiplier(activeVideoClip, clips, currentTime)
  const vignetteStrength = useMemo(
    () => activeVignetteStrength(clips, currentTime),
    [clips, currentTime],
  )

  // Imperative seek+play when user clicks a short in the left panel
  useEffect(() => {
    const vid = videoRef.current
    if (!vid || !src || previewNonce === 0) return
    const timelineT = previewStart
    const sourceT = timelineToSourceTime(clips, timelineT)
    seek(timelineT)
    setPlayheadTime(timelineT)
    const run = () => {
      vid.currentTime = sourceT
      void vid.play().catch(() => pause())
    }
    if (vid.readyState >= 1) {
      run()
    } else {
      vid.addEventListener('loadedmetadata', run, { once: true })
      return () => vid.removeEventListener('loadedmetadata', run)
    }
  }, [previewNonce, previewStart, clips, seek, setPlayheadTime, pause])

  // ── Sync timeline → video ──────────────────────────────────────────────────
  useEffect(() => {
    if (syncingFromVideo.current) return
    const vid = videoRef.current
    if (!vid || !src) return
    const targetSource = timelineToSourceTime(clips, playheadTime)
    if (Math.abs(vid.currentTime - targetSource) > 0.25) {
      vid.currentTime = targetSource
      seek(playheadTime)
    }
  }, [playheadTime, src, seek, clips])

  // ── Sync play/pause ────────────────────────────────────────────────────────
  useEffect(() => {
    const vid = videoRef.current
    if (!vid || !src) return
    if (isPlaying) vid.play().catch(() => pause())
    else vid.pause()
  }, [isPlaying, src, pause])

  // ── Sync volume / mute / speed ─────────────────────────────────────────────
  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    vid.volume       = volume
    vid.muted        = muted || hideHtmlVideo
    vid.playbackRate = playbackRate * clipSpeed
  }, [volume, muted, playbackRate, clipSpeed, hideHtmlVideo])

  // ── Style-transfer SFX slots (preview whoosh/click on timeline) ─────────────
  useEffect(() => {
    if (!isPlaying) {
      playedSfxRef.current.clear()
      return
    }
    for (const clip of clips) {
      if (!clip.effects?.sfxType) continue
      const inWindow =
        playheadTime >= clip.startTime &&
        playheadTime < clip.startTime + Math.max(0.08, clip.duration * 0.5)
      if (inWindow && !playedSfxRef.current.has(clip.id)) {
        playedSfxRef.current.add(clip.id)
        playStyleTransferSfx(
          clip.effects.sfxSlug ?? clip.effects.sfxType,
          clip.effects.sfxVolume ?? 0.32,
          clip.effects.styleToolId,
        )
      }
    }
  }, [playheadTime, isPlaying, clips])

  // ── Video events → store ────────────────────────────────────────────────────
  const onTimeUpdate = useCallback(() => {
    const vid = videoRef.current
    if (!vid) return

    let sourceT = vid.currentTime
    const advanced = advanceSourceAtClipBoundary(clips, sourceT)
    if (advanced != null) {
      sourceT = advanced
      vid.currentTime = sourceT
    }

    let timelineT = sourceTimeToTimeline(clips, sourceT)

    if (previewEnd != null && timelineT >= previewEnd) {
      vid.pause()
      pause()
      timelineT = previewEnd
      sourceT = timelineToSourceTime(clips, timelineT)
      vid.currentTime = sourceT
    }

    if (timelineT >= timelineDuration - 0.05) {
      vid.pause()
      pause()
      timelineT = timelineDuration
      sourceT = timelineToSourceTime(clips, timelineT)
      vid.currentTime = sourceT
    }

    syncingFromVideo.current = true
    setCurrentTime(timelineT)
    setPlayheadTime(timelineT)
    syncingFromVideo.current = false

    const cap = captions.find((c) => timelineT >= c.startTime && timelineT < c.endTime)
    setActiveCaptionText(cap?.text ?? null)
  }, [
    clips,
    timelineDuration,
    setCurrentTime,
    setPlayheadTime,
    setActiveCaptionText,
    captions,
    previewEnd,
    pause,
  ])

  const onLoadedMetadata = useCallback(() => {
    const vid = videoRef.current
    if (vid) setDuration(vid.duration)
  }, [setDuration])

  const onEnded = useCallback(() => {
    pause()
  }, [pause])

  // ── Scrubber interaction ────────────────────────────────────────────────────
  const onScrubberChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const timelineT = Number(e.target.value)
      clearPreviewRange()
      seek(timelineT)
      setPlayheadTime(timelineT)
      if (videoRef.current) {
        videoRef.current.currentTime = timelineToSourceTime(clips, timelineT)
      }
    },
    [seek, setPlayheadTime, clearPreviewRange, clips]
  )

  // ── Volume slider ─────────────────────────────────────────────────────────
  const onVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVolume(Number(e.target.value))
    },
    [setVolume]
  )

  useEffect(() => {
    if (src) return
    setActiveCaptionText(null)
  }, [src, setActiveCaptionText])

  // ── Fullscreen change listener ──────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }, [])

  const progress = timelineDuration > 0 ? currentTime / timelineDuration : 0

  const handleTogglePlay = useCallback(() => {
    if (!isPlaying) clearPreviewRange()
    togglePlay()
  }, [isPlaying, togglePlay, clearPreviewRange])

  const ratioCss = aspectRatio ? ASPECT_MAP[aspectRatio] ?? undefined : undefined

  return (
    <div
      ref={containerRef}
      data-testid="video-player"
      className="flex flex-col h-full bg-black"
    >
      {/* ── Video / placeholder canvas ────────────────────────────────────── */}
      <div className="flex-1 relative flex items-center justify-center min-h-0 overflow-hidden bg-black">
        <div
          className="relative max-w-full max-h-full"
          style={ratioCss ? { aspectRatio: ratioCss, width: '100%', height: 'auto' } : undefined}
        >
          {src ? (
            <VideoLayoutFrame>
              <video
                ref={videoRef}
                src={src}
                preload="metadata"
                playsInline
                className={[
                  'w-full h-full object-contain transition-opacity duration-75',
                  hideHtmlVideo ? 'opacity-0 pointer-events-none' : '',
                ].join(' ')}
                style={{
                  filter: !hideHtmlVideo && videoFilter !== 'none' ? videoFilter : undefined,
                  opacity: hideHtmlVideo ? 0 : videoOpacity,
                  transform: !hideHtmlVideo && videoScale !== 1 ? `scale(${videoScale})` : undefined,
                  transformOrigin: 'center center',
                }}
                onTimeUpdate={onTimeUpdate}
                onLoadedMetadata={onLoadedMetadata}
                onEnded={onEnded}
                data-testid="video-element"
              />
            </VideoLayoutFrame>
          ) : (
            /* Placeholder — shown when no video is loaded */
            <div
              data-testid="player-placeholder"
              className="flex flex-col items-center justify-center gap-3 text-text-disabled w-full h-full"
            >
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                <rect x="4" y="10" width="40" height="28" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="24" cy="24" r="8" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M21 21L29 24L21 27V21Z" fill="currentColor"/>
              </svg>
              <span className="text-sm">No video loaded</span>
            </div>
          )}

          {/* Caption overlay — uses Noto Sans Devanagari (font-nepali) */}
          {!overlayRemotion && <CaptionOverlay />}
          {!overlayRemotion && <VisualOverlayLayer />}
          {!overlayRemotion && vignetteStrength > 0 && (
            <div
              data-testid="video-vignette-overlay"
              className="absolute inset-0 pointer-events-none z-[15]"
              style={{
                background: `radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,${Math.min(0.85, vignetteStrength * 2)}) 100%)`,
              }}
              aria-hidden="true"
            />
          )}
          {wantsUnifiedPreview && projectId && (
            <DirectorRemotionPreview
              projectId={projectId}
              onReady={handleRemotionReady}
              onFailed={handleRemotionFailed}
            />
          )}
          <BrollPreviewUpload />
          <div
            data-testid="time-display"
            className="absolute bottom-2 left-2 font-mono text-xs text-white bg-black/60 px-2 py-0.5 rounded pointer-events-none"
          >
            {formatTime(currentTime)} / {formatTime(timelineDuration)}
          </div>
        </div>
      </div>

      {/* ── Controls bar ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-bg-surface border-t border-bg-overlay">
        {/* Scrubber */}
        <div className="px-4 pt-2 pb-1">
          <input
            data-testid="player-scrubber"
            type="range"
            min={0}
            max={timelineDuration || 100}
            step={0.1}
            value={currentTime}
            onChange={onScrubberChange}
            aria-label="Playback position"
            className="w-full accent-accent cursor-pointer"
            style={{ height: 4 }}
          />
        </div>

        {/* Buttons row */}
        <div className="flex items-center gap-2 px-4 pb-2">
          {/* Rewind */}
          <button
            data-testid="player-rewind"
            onClick={() => {
              const t = Math.max(0, currentTime - 5)
              seek(t)
              setPlayheadTime(t)
              if (videoRef.current) {
                videoRef.current.currentTime = timelineToSourceTime(clips, t)
              }
            }}
            aria-label="Rewind 5 seconds (J)"
            title="Rewind 5 s (J)"
            className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M9 4L4 8L9 12V4Z" fill="currentColor"/>
              <path d="M13 4L8 8L13 12V4Z" fill="currentColor"/>
            </svg>
          </button>

          {/* Play / Pause */}
          <button
            data-testid="player-play-pause"
            onClick={handleTogglePlay}
            aria-label={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            title={isPlaying ? 'Pause' : 'Play'}
            className="p-2 rounded-full bg-accent hover:bg-accent-glow text-white transition-colors"
          >
            {isPlaying ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="3" y="2" width="3" height="10" rx="1" fill="currentColor"/>
                <rect x="8" y="2" width="3" height="10" rx="1" fill="currentColor"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M4 2L12 7L4 12V2Z" fill="currentColor"/>
              </svg>
            )}
          </button>

          {/* Forward */}
          <button
            data-testid="player-forward"
            onClick={() => {
              const t = Math.min(timelineDuration, currentTime + 5)
              seek(t)
              setPlayheadTime(t)
              if (videoRef.current) {
                videoRef.current.currentTime = timelineToSourceTime(clips, t)
              }
            }}
            aria-label="Forward 5 seconds (L)"
            title="Forward 5 s (L)"
            className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M7 4L12 8L7 12V4Z" fill="currentColor"/>
              <path d="M3 4L8 8L3 12V4Z" fill="currentColor"/>
            </svg>
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Volume */}
          <button
            data-testid="player-mute"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors flex-shrink-0"
          >
            {muted || volume === 0 ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 6H6L9 3V13L6 10H3V6Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
                <path d="M12 5L14 7M14 5L12 7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 6H6L9 3V13L6 10H3V6Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
                <path d="M11 5C12.3 6 12.3 10 11 11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
              </svg>
            )}
          </button>

          <input
            data-testid="player-volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={onVolumeChange}
            aria-label="Volume"
            className="w-16 accent-accent"
          />

          {/* Speed control */}
          <SpeedControl />

          {/* Fullscreen */}
          <button
            data-testid="player-fullscreen"
            onClick={handleToggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
            className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors"
          >
            {isFullscreen ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 2v3h3M12 2v3h3M12 12v-3h3M2 12v-3h3"
                  stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M1 5V2H4M10 2H13V5M13 9V12H10M4 12H1V9"
                  stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
