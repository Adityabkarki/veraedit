'use client'

/**
 * Clip — interactive clip block on the timeline.
 *
 * Features:
 * - Drag body to move (left/right, clamped to time ≥ 0)
 * - Left trim handle: drag to shorten/lengthen from the left
 * - Right trim handle: drag to shorten/lengthen from the right
 * - Snap to nearby clip edges and playhead (orange indicator via store)
 * - Selection highlight (outline in track color)
 * - Hover tooltip: name, duration, track type
 * - Right-click context menu: Split at playhead / Duplicate / Delete
 * - Locked track: cursor + interactions disabled
 */

import { useCallback, useState, useRef } from 'react'
import { useTimelineStore } from '@/stores/timelineStore'
import { useVisualLibraryStore } from '@/stores/visualLibraryStore'
import { syncOverlayClipFromTimeline } from '@/lib/visualTimelineSync'
import { openCaptionEditor, syncCaptionClipFromTimeline } from '@/lib/captionTimelineSync'
import { useCaptionsStore } from '@/stores/captionsStore'
import { useEffectsStore } from '@/stores/effectsStore'
import { transitionTimelineLabel } from '@/lib/applyEffects'
import type { Clip as ClipData, Track } from '@/stores/timelineStore'
import { isBrollClip, isImageClip } from '@/lib/mediaClips'
import { isChartOrProcessClip } from '@/lib/chartVisualTypes'
import { openBrollEditor } from '@/lib/brollMedia'
import { openImageEditor } from '@/lib/imageMedia'
import { isCaptionEffectClip } from '@/lib/captionEffects'
import { isCameraZoomClip, cameraZoomLabel, openCameraZoomEditor } from '@/lib/cameraZoom'
import { keyframesUseNormalizedOffsets } from '@/lib/effectKeyframes'

const SNAP_THRESHOLD_PX = 8
const MIN_DURATION      = 0.1    // seconds

interface ClipProps {
  clip:  ClipData
  track: Track
}

function formatDuration(seconds: number): string {
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`
  const s = Math.floor(seconds)
  const ds = Math.round((seconds - s) * 10)
  const m = Math.floor(s / 60)
  const ss = s % 60
  if (m > 0) return `${m}:${String(ss).padStart(2, '0')}.${ds}s`
  return `${s}.${ds}s`
}

export function Clip({ clip, track }: ClipProps) {
  const {
    pixelsPerSecond,
    playheadTime,
    selectedClipIds,
    snapEnabled,
    clips,
    setSnapIndicatorTime,
    moveClip,
    trimClipStart,
    trimClipEnd,
    selectClip,
    splitClip,
    deleteSelectedClips,
    duplicateClip,
    beginEdit,
    endEdit,
  } = useTimelineStore()

  const [showTooltip, setShowTooltip] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const finishEdit = useCallback(
    (label: string) => {
      endEdit(label)
      if (clip.trackId === 'overlay') syncOverlayClipFromTimeline(clip.id)
      if (clip.trackId === 'captions') syncCaptionClipFromTimeline(clip.id)
      if (clip.trackId === 'effects') syncEffectClipAfterTrim(clip.id)
    },
    [clip.id, clip.trackId, endEdit],
  )

  const isSelected = selectedClipIds.includes(clip.id)
  const left       = clip.startTime * pixelsPerSecond
  const isCaptionFx = isCaptionEffectClip(clip)
  const isCameraZoom = isCameraZoomClip(clip)
  const isEffectClip = clip.trackId === 'effects' || clip.type === 'effect' || isCaptionFx
  const isBroll = isBrollClip(clip)
  const isImage = isImageClip(clip)
  const isChartElement = isChartOrProcessClip(clip)
  const isOverlayElement =
    ((clip.trackId === 'overlay' || clip.trackId.startsWith('overlay-')) &&
      !isBroll &&
      !isImage &&
      clip.type === 'overlay') ||
    isChartElement
  const width      = Math.max(clip.duration * pixelsPerSecond, isOverlayElement ? 48 : 4)
  const isSfxClip = Boolean(clip.effects?.sfxType)
  const isMusicBed = Boolean(clip.effects?.musicBed)
  const isPacingCut = Boolean(clip.effects?.pacingSegment)
  const keyframes = clip.effects?.keyframes ?? []
  const transitionOut = clip.effects?.transitionOut
  const transitionDur = clip.effects?.transitionDuration ?? 0
  const hasTransition = clip.trackId === 'video' && transitionOut && transitionOut !== 'cut'
  const transitionWidthPx = hasTransition
    ? Math.max(6, Math.min(width * 0.35, transitionDur * pixelsPerSecond))
    : 0

  // ── Snap helper ────────────────────────────────────────────────────────────
  const snap = useCallback(
    (proposedTime: number): number => {
      if (!snapEnabled) return proposedTime

      const threshold = SNAP_THRESHOLD_PX / pixelsPerSecond
      const snapPoints = [0, playheadTime]

      for (const c of clips) {
        if (c.id === clip.id) continue
        snapPoints.push(c.startTime)
        snapPoints.push(c.startTime + c.duration)
      }

      let nearest: number | null = null
      let nearestDist = threshold

      for (const p of snapPoints) {
        const dist = Math.abs(proposedTime - p)
        if (dist < nearestDist) {
          nearestDist = dist
          nearest = p
        }
      }

      if (nearest !== null) {
        setSnapIndicatorTime(nearest)
        return nearest
      }
      setSnapIndicatorTime(null)
      return proposedTime
    },
    [snapEnabled, pixelsPerSecond, playheadTime, clips, clip.id, setSnapIndicatorTime]
  )

  // ── Body drag ──────────────────────────────────────────────────────────────
  const onBodyMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || track.locked) return
      e.stopPropagation()
      if (!isSelected) selectClip(clip.id)
      beginEdit()

      const startX           = e.clientX
      const originalStart    = clip.startTime

      const onMouseMove = (ev: MouseEvent) => {
        const deltaTime = (ev.clientX - startX) / pixelsPerSecond
        const proposed  = Math.max(0, originalStart + deltaTime)
        moveClip(clip.id, snap(proposed))
      }

      const onMouseUp = () => {
        setSnapIndicatorTime(null)
        finishEdit('Moved clip')
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup',   onMouseUp)
        document.body.style.cursor     = ''
        document.body.style.userSelect = ''
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup',   onMouseUp)
      document.body.style.cursor     = 'grabbing'
      document.body.style.userSelect = 'none'
    },
    [
      clip.id, clip.startTime, pixelsPerSecond, isSelected, track.locked,
      selectClip, moveClip, snap, setSnapIndicatorTime, beginEdit, endEdit,
    ]
  )

  // ── Left trim ──────────────────────────────────────────────────────────────
  const onLeftTrimMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      beginEdit()

      const startX          = e.clientX
      const originalStart   = clip.startTime
      const originalDuration = clip.duration

      const onMouseMove = (ev: MouseEvent) => {
        const deltaTime   = (ev.clientX - startX) / pixelsPerSecond
        const newStart    = Math.max(0, originalStart + deltaTime)
        const newDuration = Math.max(MIN_DURATION, originalDuration - (newStart - originalStart))
        trimClipStart(clip.id, newStart, newDuration)
      }

      const onMouseUp = () => {
        finishEdit('Trimmed clip start')
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup',   onMouseUp)
        document.body.style.cursor     = ''
        document.body.style.userSelect = ''
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup',   onMouseUp)
      document.body.style.cursor     = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [clip.id, clip.startTime, clip.duration, pixelsPerSecond, trimClipStart, beginEdit, endEdit]
  )

  // ── Right trim ─────────────────────────────────────────────────────────────
  const onRightTrimMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      beginEdit()

      const startX           = e.clientX
      const originalDuration = clip.duration

      const onMouseMove = (ev: MouseEvent) => {
        const deltaTime   = (ev.clientX - startX) / pixelsPerSecond
        const newDuration = Math.max(MIN_DURATION, originalDuration + deltaTime)
        trimClipEnd(clip.id, newDuration)
      }

      const onMouseUp = () => {
        finishEdit('Trimmed clip end')
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup',   onMouseUp)
        document.body.style.cursor     = ''
        document.body.style.userSelect = ''
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup',   onMouseUp)
      document.body.style.cursor     = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [clip.id, clip.duration, pixelsPerSecond, trimClipEnd, beginEdit, endEdit]
  )

  // ── Context menu ───────────────────────────────────────────────────────────
  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      selectClip(clip.id)
      setContextMenu({ x: e.clientX, y: e.clientY })
    },
    [clip.id, selectClip]
  )

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  // ── Tooltip with small delay (avoids flicker on fast mouse pass) ───────────
  const onMouseEnter = useCallback(() => {
    tooltipTimerRef.current = setTimeout(() => setShowTooltip(true), 400)
  }, [])
  const onMouseLeave = useCallback(() => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
    setShowTooltip(false)
  }, [])

  return (
    <>
      {/* ── Clip body ──────────────────────────────────────────────────────── */}
      <div
        data-testid={`clip-${clip.id}`}
        aria-selected={isSelected}
        className="absolute top-1 bottom-1 rounded group select-none"
        style={{
          left,
          width,
          background: isBroll
            ? clip.effects?.mediaUrl
              ? 'linear-gradient(90deg, #111827, #374151)'
              : '#000000'
            : isImage
              ? clip.effects?.mediaUrl
                ? 'linear-gradient(90deg, #0E7490, #06B6D4)'
                : 'linear-gradient(90deg, #164E63, #0891B2)'
            : isCameraZoom
              ? 'linear-gradient(90deg, #1D4ED866, #3B82F6AA)'
            : isSfxClip
            ? 'linear-gradient(90deg, #F59E0B44, #FBBF2488)'
            : isMusicBed
              ? 'linear-gradient(90deg, #10B98144, #34D39988)'
              : isPacingCut
                ? 'linear-gradient(90deg, #3B82F644, #60A5FA66)'
                : isCaptionFx
                  ? 'linear-gradient(90deg, #D9770655, #FBBF2488)'
                  : isEffectClip
                    ? 'linear-gradient(90deg, #7C3AED55, #A78BFA88)'
                    : isChartElement
                      ? 'linear-gradient(90deg, #4F46E588, #6366F1CC)'
                      : isOverlayElement
                        ? `linear-gradient(90deg, ${track.color}88, ${track.color}CC)`
                        : `${track.color}33`,
          border: `1px solid ${
            isSelected
              ? isBroll ? '#9CA3AF' : isImage ? '#22D3EE' : isCameraZoom ? '#60A5FA' : track.color
              : isBroll
                ? '#4B5563'
                : isImage
                  ? '#0891B2CC'
                : isCameraZoom
                  ? '#3B82F6CC'
                : isSfxClip
                ? '#F59E0B99'
                : isMusicBed
                  ? '#10B98199'
                  : isCaptionFx
                    ? '#D9770699'
                    : isEffectClip
                      ? '#7C3AED99'
                      : isChartElement
                        ? '#818CF8DD'
                        : isOverlayElement
                          ? `${track.color}DD`
                          : `${track.color}66`
          }`,
          outline:     isSelected
            ? `2px solid ${isBroll ? '#D1D5DB' : isImage ? '#67E8F9' : isCameraZoom ? '#93C5FD' : isSfxClip ? '#FBBF24' : isMusicBed ? '#34D399' : isCaptionFx ? '#FBBF24' : isEffectClip ? '#A78BFA' : isChartElement ? '#A5B4FC' : isOverlayElement ? '#F9A8D4' : track.color}`
            : 'none',
          outlineOffset: '1px',
          cursor:      track.locked ? 'not-allowed' : 'grab',
          opacity:     track.visible ? 1 : 0.35,
        }}
        onMouseDown={onBodyMouseDown}
        onClick={(e) => {
          e.stopPropagation()
          selectClip(clip.id)
          if (
            (clip.trackId === 'overlay' || clip.trackId.startsWith('overlay-')) &&
            !isBrollClip(clip) &&
            !isImageClip(clip)
          ) {
            useVisualLibraryStore.getState().startEditOverlay(clip.id)
          }
          if (clip.trackId === 'captions') {
            openCaptionEditor(clip.id)
          }
          if (clip.trackId === 'effects') {
            useEffectsStore.getState().startEditingEffect(clip.id)
          }
          if (isBroll) {
            openBrollEditor(clip.id)
          }
          if (isImage) {
            openImageEditor(clip.id)
          }
          if (isCameraZoom) {
            openCameraZoomEditor(clip.id)
          }
        }}
        onContextMenu={onContextMenu}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* Left trim handle */}
        {!track.locked && (
          <div
            data-testid={`clip-${clip.id}-trim-left`}
            className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize
                       hover:bg-white/20 rounded-l z-10 flex-shrink-0"
            onMouseDown={onLeftTrimMouseDown}
          />
        )}

        {/* Label */}
        <span
          className="absolute inset-x-3 top-1/2 -translate-y-1/2
                     text-[10px] font-medium truncate pointer-events-none"
          style={{ color: isBroll || isImage || isCameraZoom || isOverlayElement || isChartElement ? '#F9FAFB' : track.color }}
        >
          {isBroll ? 'B-Roll' : isImage ? `🖼 ${clip.label}` : isCameraZoom ? `📷 ${cameraZoomLabel(clip)}` : clip.label}
        </span>

        {clip.effects?.styleTransfer && (
          <span
            className="absolute top-0.5 right-1 text-[8px] font-bold uppercase tracking-wide
                       px-1 rounded bg-violet-600/80 text-white pointer-events-none z-10"
            title="Style transfer applied"
          >
            Style
          </span>
        )}

        {hasTransition && (
          <>
            <div
              data-testid={`clip-${clip.id}-transition-out`}
              className="absolute right-0 top-0 bottom-0 pointer-events-none z-10
                         bg-gradient-to-l from-amber-400/55 to-amber-400/10 border-l border-amber-300/90"
              style={{ width: transitionWidthPx }}
              title={`${transitionTimelineLabel(transitionOut)} (${transitionDur}s)`}
            />
            {width > 28 && (
              <span
                className="absolute bottom-0.5 right-1 text-[8px] font-bold text-amber-100
                           bg-amber-900/70 px-1 rounded pointer-events-none z-20 truncate max-w-[90%]"
              >
                {transitionTimelineLabel(transitionOut)}
              </span>
            )}
          </>
        )}

        {/* Keyframe diamonds on effect clips */}
        {(isEffectClip || isCameraZoom) && keyframes.map((kf, i) => {
          const normalized = keyframesUseNormalizedOffsets(keyframes)
          const kfLeft = normalized
            ? kf.offset * width
            : (kf.offset / Math.max(clip.duration, 0.1)) * width
          return (
            <span
              key={`${clip.id}-kf-${i}`}
              data-testid={`effect-kf-marker-${clip.id}-${i}`}
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-violet-200 border border-violet-400 pointer-events-none z-10"
              style={{ left: Math.max(0, Math.min(width - 4, kfLeft)) }}
              title={`Keyframe ${i + 1}: ${(typeof kf.value === 'number' ? kf.value : 0).toFixed(2)}`}
            />
          )
        })}

        {/* Right trim handle */}
        {!track.locked && (
          <div
            data-testid={`clip-${clip.id}-trim-right`}
            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize
                       hover:bg-white/20 rounded-r z-10 flex-shrink-0"
            onMouseDown={onRightTrimMouseDown}
          />
        )}

        {/* Hover tooltip */}
        {showTooltip && (
          <div
            data-testid={`clip-${clip.id}-tooltip`}
            className="absolute bottom-full mb-1 left-0 z-50 px-2.5 py-1.5
                       rounded-lg bg-bg-elevated border border-bg-overlay shadow-xl
                       text-xs pointer-events-none whitespace-nowrap animate-fade-in"
          >
            <p className="font-semibold text-text-primary">{clip.label}</p>
            <p className="text-text-secondary">{formatDuration(clip.duration)}</p>
            <p className="text-text-disabled capitalize mt-0.5">{clip.type} track</p>
            {clip.effects?.colorFilterId && clip.effects.colorFilterId !== 'none' && (
              <p className="text-text-secondary mt-0.5">
                Filter: {clip.effects.colorFilterId === 'style-transfer' ? 'Style color grade' : clip.effects.colorFilterId}
              </p>
            )}
            {clip.effects?.styleTransfer && (
              <p className="text-violet-300 mt-0.5">Reference style applied</p>
            )}
            {clip.effects?.transitionOut && clip.effects.transitionOut !== 'cut' && (
              <p className="text-text-secondary">Transition: {clip.effects.transitionOut}</p>
            )}
            {clip.speed != null && clip.speed !== 1 && (
              <p className="text-text-secondary">Speed: {clip.speed}×</p>
            )}
          </div>
        )}
      </div>

      {/* ── Context menu ───────────────────────────────────────────────────── */}
      {contextMenu && (
        <>
          {/* Invisible backdrop to catch outside clicks */}
          <div
            className="fixed inset-0 z-40"
            onClick={closeContextMenu}
            onContextMenu={(e) => { e.preventDefault(); closeContextMenu() }}
          />
          <div
            data-testid={`clip-${clip.id}-context-menu`}
            className="fixed z-50 py-1 min-w-44 bg-bg-elevated border border-bg-overlay
                       rounded-lg shadow-xl text-sm animate-fade-in"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => { splitClip(clip.id, playheadTime); closeContextMenu() }}
              className="w-full flex items-center gap-2 px-3 py-1.5
                         text-text-secondary hover:text-text-primary hover:bg-bg-overlay text-left"
            >
              <span className="text-base leading-none">✂</span> Split at playhead
            </button>
            <button
              onClick={() => { duplicateClip(clip.id); closeContextMenu() }}
              className="w-full flex items-center gap-2 px-3 py-1.5
                         text-text-secondary hover:text-text-primary hover:bg-bg-overlay text-left"
            >
              <span className="text-base leading-none">⧉</span> Duplicate
            </button>
            <div className="my-1 h-px bg-bg-overlay" />
            <button
              onClick={() => {
                if (clip.trackId === 'captions') {
                  useCaptionsStore.getState().deleteCaption(clip.id)
                } else if (clip.trackId === 'effects') {
                  useTimelineStore.setState((s) => ({
                    clips: s.clips.filter((c) => c.id !== clip.id),
                    selectedClipIds: s.selectedClipIds.filter((id) => id !== clip.id),
                    lastEditAction: 'Removed effect',
                  }))
                  useEffectsStore.getState().stopEditingEffect()
                } else {
                  selectClip(clip.id)
                  deleteSelectedClips()
                }
                closeContextMenu()
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5
                         text-status-error hover:bg-bg-overlay text-left"
            >
              <span className="text-base leading-none">🗑</span> Delete
            </button>
          </div>
        </>
      )}
    </>
  )
}

/** After trim/move, keep last keyframe aligned with clip end. */
function syncEffectClipAfterTrim(clipId: string) {
  const clip = useTimelineStore.getState().clips.find((c) => c.id === clipId)
  if (!clip?.effects?.keyframes?.length) return
  const kfs = [...clip.effects.keyframes].sort((a, b) => a.offset - b.offset)
  const last = kfs[kfs.length - 1]
  if (Math.abs(last.offset - clip.duration) < 0.05) return
  kfs[kfs.length - 1] = { ...last, offset: clip.duration }
  useTimelineStore.setState((s) => ({
    clips: s.clips.map((c) =>
      c.id === clipId ? { ...c, effects: { ...c.effects, keyframes: kfs } } : c,
    ),
  }))
}
