'use client'

/**
 * Timeline — full interactive NLE bottom panel.
 *
 * Layout (horizontal scroll covers ruler + clip lanes):
 *
 *   ┌──toolbar────────────────────────────────────────────────────────────────┐
 *   │ ✂ 🧲 🔍  zoom ──────────  [legend: ■Video ■Audio ■Captions ■Music]      │
 *   ├──[track headers sticky]──┬──[scrollable ruler + clip lanes]─────────────┤
 *   │  Video   M🔒👁            │  ──ruler──────────────────────────────────── │
 *   │  Audio   M🔒👁            │  ─clip─lane──────────────────────────────── │
 *   │  Captions M🔒👁           │  ─clip─lane──────────────────────────────── │
 *   │  Music    M🔒👁           │  ─clip─lane──────────────────────────────── │
 *   └──────────────────────────┴──────────────────────────────────────────────┘
 *
 * Track headers are sticky (left: 0) so they stay visible on scroll.
 * Playhead and snap indicator span full track height.
 *
 * Keyboard shortcuts handled in EditorPage.tsx:
 *   Space / J / L / K / ← → / Shift←→ / C / Delete / Ctrl+Z / Ctrl+Y / Ctrl+D
 */

import { useRef, useCallback, useMemo } from 'react'
import { useDismissClipEditorOnEscape } from '@/hooks/useDismissClipEditorOnEscape'
import { useTimelineStore, PPS_MIN, PPS_MAX, PPS_DEFAULT } from '@/stores/timelineStore'
import { useEffectsStore }  from '@/stores/effectsStore'
import { insertStyleToolAt, parseStyleToolDrag } from '@/lib/styleToolboxSync'
import { PanelTooltip } from '@/components/editor/PanelTooltip'
import { TimelineRuler } from '@/components/editor/timeline/TimelineRuler'
import { TrackHeader }   from '@/components/editor/timeline/TrackHeader'
import { Clip }          from '@/components/editor/timeline/Clip'
import { Playhead }      from '@/components/editor/timeline/Playhead'
import { SnapIndicator } from '@/components/editor/timeline/SnapIndicator'
import { UndoToast }     from '@/components/editor/timeline/UndoToast'
import { EffectRangeOverlay } from '@/components/editor/timeline/EffectRangeOverlay'
import { EffectKeyframePanel } from '@/components/editor/timeline/EffectKeyframePanel'
import { BrollClipPanel } from '@/components/editor/timeline/BrollClipPanel'
import { ImageClipPanel } from '@/components/editor/timeline/ImageClipPanel'
import { OverlayElementClipPanel } from '@/components/editor/timeline/OverlayElementClipPanel'
import { CaptionEffectClipPanel } from '@/components/editor/timeline/CaptionEffectClipPanel'
import { CameraZoomClipPanel } from '@/components/editor/timeline/CameraZoomClipPanel'
import { SelectedClipTimingBar } from '@/components/editor/timeline/SelectedClipTimingBar'

import { TRACK_HEIGHT_PX, TIMELINE_HEADER_WIDTH_PX } from '@/lib/timelineLayout'
import { tracksWithContent } from '@/lib/timelineLayers'

const TRACK_HEIGHT      = TRACK_HEIGHT_PX
const HEADER_WIDTH      = TIMELINE_HEADER_WIDTH_PX
const CONTENT_PADDING_R = 120  // px extra right space past the last clip

// ── Icons ──────────────────────────────────────────────────────────────────

const ScissorsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="3.5" cy="4"  r="1.5" stroke="currentColor" strokeWidth="1.2"/>
    <circle cx="3.5" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M5 5.5L11 9M5 8.5L11 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
)

const MagnetIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M3 3V7C3 9.2 4.8 11 7 11C9.2 11 11 9.2 11 7V3"
      stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M3 3H5M11 3H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
)

const ZoomInIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M4 6H8M6 4V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
)

const ZoomOutIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M4 6H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
)

// ── Component ─────────────────────────────────────────────────────────────────

export function Timeline() {
  const {
    tracks,
    clips,
    pixelsPerSecond,
    snapEnabled,
    selectedClipIds,
    setPixelsPerSecond,
    setScrollX,
    toggleSnap,
    zoomIn,
    zoomOut,
    zoomToFit,
    clearSelection,
    splitClip,
    setPlayheadTime,
    playheadTime,
  } = useTimelineStore()

  const { toggleDrawer, isOpen: drawerOpen, editingEffectClipId } = useEffectsStore()

  const hasClipEditorOpen =
    selectedClipIds.length > 0 || editingEffectClipId != null
  useDismissClipEditorOnEscape(hasClipEditorOpen)

  const visibleTracks = useMemo(
    () => tracksWithContent(tracks, clips),
    [tracks, clips],
  )

  const scrollRef = useRef<HTMLDivElement>(null)
  const verticalScrollRef = useRef<HTMLDivElement>(null)

  // Compute total timeline duration from the rightmost clip edge
  const totalDuration = Math.max(
    20,
    ...clips.map((c) => c.startTime + c.duration)
  )
  const totalWidth = totalDuration * pixelsPerSecond + CONTENT_PADDING_R
  const tracksHeight = visibleTracks.length * TRACK_HEIGHT

  // Sync scrollX state when the horizontal scroll container scrolls
  const onHorizontalScroll = useCallback(() => {
    if (scrollRef.current) setScrollX(scrollRef.current.scrollLeft)
  }, [setScrollX])

  const onZoomToFit = useCallback(() => {
    const viewport =
      verticalScrollRef.current?.clientWidth ??
      scrollRef.current?.clientWidth ??
      800
    zoomToFit(viewport, totalDuration)
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0
    }
  }, [zoomToFit, totalDuration])

  // Click on empty track space: deselect + set playhead
  const onLaneClick = useCallback(
    (e: React.MouseEvent, trackId: string) => {
      if ((e.target as HTMLElement).closest('[data-testid^="clip-"]')) return
      clearSelection()
      const rect   = e.currentTarget.getBoundingClientRect()
      const x      = e.clientX - rect.left
      const t      = Math.max(0, x / pixelsPerSecond)
      setPlayheadTime(t)
    },
    [clearSelection, pixelsPerSecond, setPlayheadTime]
  )

  const onStyleToolDrop = useCallback(
    (e: React.DragEvent) => {
      const payload = parseStyleToolDrag(e.dataTransfer.getData('text/plain'))
      if (!payload) return
      e.preventDefault()
      const area = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - area.left
      const t = Math.max(0, x / pixelsPerSecond)
      setPlayheadTime(t)
      insertStyleToolAt(payload.toolId, payload.toolName, t)
    },
    [pixelsPerSecond, setPlayheadTime],
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  // Zoom slider: PPS_MIN–PPS_MAX px/s
  const onZoomSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPixelsPerSecond(Number(e.target.value))
    },
    [setPixelsPerSecond]
  )

  const zoomPercent = Math.round((pixelsPerSecond / PPS_DEFAULT) * 100)

  return (
    <>
      <div
        data-testid="timeline"
        className="flex flex-col flex-1 min-h-0 bg-bg-surface overflow-hidden relative"
      >
        {/* First-time tooltip */}
        <PanelTooltip
          panelKey="timeline"
          title="Timeline"
          description="Drag clips to rearrange. Use the scissors to split. Press Space to play."
          placement="top"
        />

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <div
          data-testid="timeline-toolbar"
          className="flex items-center gap-2 px-3 py-1.5 border-b border-bg-overlay flex-shrink-0"
        >
          {/* Cut */}
          <button
            data-testid="timeline-tool-cut"
            aria-label="Cut tool — split at playhead (C)"
            title="Split at playhead (C)"
            onClick={() => {
              if (selectedClipIds.length > 0) {
                selectedClipIds.forEach((id) => splitClip(id, playheadTime))
              }
            }}
            className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors"
          >
            <ScissorsIcon />
          </button>

          {/* Snap */}
          <button
            data-testid="timeline-tool-snap"
            aria-label={snapEnabled ? 'Disable snap' : 'Enable snap'}
            aria-pressed={snapEnabled}
            title={snapEnabled ? 'Snap on' : 'Snap off'}
            onClick={toggleSnap}
            className={[
              'p-1.5 rounded transition-colors',
              snapEnabled
                ? 'text-accent bg-accent/10'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-overlay',
            ].join(' ')}
          >
            <MagnetIcon />
          </button>

          {/* Zoom out */}
          <button
            data-testid="timeline-zoom-out"
            aria-label="Zoom out (-)"
            title="Zoom out (-)"
            onClick={zoomOut}
            className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors"
          >
            <ZoomOutIcon />
          </button>

          {/* Zoom slider */}
          <input
            data-testid="timeline-zoom-slider"
            type="range"
            min={PPS_MIN}
            max={PPS_MAX}
            step={2}
            value={pixelsPerSecond}
            onChange={onZoomSlider}
            aria-label="Timeline zoom level"
            className="w-24 accent-accent"
          />

          {/* Zoom in */}
          <button
            data-testid="timeline-zoom-in"
            aria-label="Zoom in (=)"
            title="Zoom in (=)"
            onClick={zoomIn}
            className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors"
          >
            <ZoomInIcon />
          </button>

          <button
            data-testid="timeline-zoom-fit"
            type="button"
            aria-label="Fit timeline to width"
            title="Fit entire timeline to screen width"
            onClick={onZoomToFit}
            className="px-2 py-1 rounded text-[11px] font-medium text-text-secondary hover:text-text-primary hover:bg-bg-overlay border border-bg-overlay transition-colors"
          >
            Fit
          </button>

          {/* Zoom label */}
          <span className="text-xs font-mono text-text-disabled w-14 text-right">
            {zoomPercent}%
          </span>

          {/* Effects drawer button */}
          <button
            data-testid="effects-button"
            onClick={toggleDrawer}
            aria-label="Effects & templates"
            aria-pressed={drawerOpen}
            title="Effects & Templates"
            className={[
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
              drawerOpen
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-overlay border border-bg-overlay',
            ].join(' ')}
          >
            <span aria-hidden="true">✨</span>
            Effects
          </button>

          <div className="h-4 w-px bg-bg-overlay mx-1" />

          <div className="flex-1" />

          <span className="text-[10px] text-text-disabled shrink-0">
            {visibleTracks.length} tracks · scroll vertically
          </span>
        </div>

        {/* ── Track headers + scrollable clip area ──────────────────────── */}
        <div
          ref={verticalScrollRef}
          data-testid="timeline-tracks-scroll"
          className="flex flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
        >
          <div className="flex min-w-full min-h-min">
            {/* Left: track headers (scroll vertically with lanes) */}
            <div
              className="flex-shrink-0 flex flex-col border-r border-bg-overlay z-10 bg-bg-surface sticky left-0"
              style={{ width: HEADER_WIDTH }}
            >
              <div className="h-6 bg-bg-elevated border-b border-bg-overlay flex-shrink-0" />
              {visibleTracks.map((track) => (
                <div
                  key={track.id}
                  style={{ height: TRACK_HEIGHT }}
                  className="flex-shrink-0"
                >
                  <TrackHeader track={track} />
                </div>
              ))}
            </div>

            {/* Right: horizontal scroll for ruler + clips */}
            <div
              ref={scrollRef}
              data-testid="timeline-horizontal-scroll"
              className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden"
              onScroll={onHorizontalScroll}
            >
              <div style={{ width: totalWidth }}>
                <TimelineRuler totalDuration={totalDuration} />

                <div
                  data-testid="timeline-clip-area"
                  className="relative"
                  style={{ height: tracksHeight }}
                  onDragOver={onDragOver}
                  onDrop={onStyleToolDrop}
                >
                  <Playhead
                    trackCount={visibleTracks.length}
                    trackHeight={TRACK_HEIGHT}
                  />

                  <SnapIndicator
                    trackCount={visibleTracks.length}
                    trackHeight={TRACK_HEIGHT}
                  />

                  <EffectRangeOverlay
                    pixelsPerSecond={pixelsPerSecond}
                    height={tracksHeight}
                  />

                  {visibleTracks.map((track, index) => {
                    const trackClips = clips.filter((c) => c.trackId === track.id)
                    return (
                      <div
                        key={track.id}
                        data-testid={`timeline-track-${track.id}`}
                        className="absolute w-full border-b border-bg-overlay"
                        style={{
                          top: index * TRACK_HEIGHT,
                          height: TRACK_HEIGHT,
                        }}
                        onClick={(e) => onLaneClick(e, track.id)}
                      >
                        {trackClips.map((clip) => (
                          <Clip key={clip.id} clip={clip} track={track} />
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <EffectKeyframePanel />
        <BrollClipPanel />
        <ImageClipPanel />
        <OverlayElementClipPanel />
        <CaptionEffectClipPanel />
        <CameraZoomClipPanel />
        <SelectedClipTimingBar />
      </div>

      {/* Undo toast — rendered outside timeline so it floats over the full editor */}
      <UndoToast />
    </>
  )
}
