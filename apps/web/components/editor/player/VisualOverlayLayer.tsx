'use client'

/**
 * VisualOverlayLayer — renders AI-suggested stats, numbers, lists, and CTAs
 * over the video preview. Uses brand kit colors when available.
 */

import { useRef, useCallback, useMemo } from 'react'
import { useTimelineStore } from '@/stores/timelineStore'
import { usePlayerStore } from '@/stores/playerStore'
import { useVisualLibraryStore } from '@/stores/visualLibraryStore'
import type { Clip } from '@/stores/timelineStore'
import { isBrollClip, isImageClip } from '@/lib/mediaClips'
import { computeOverlayMotion } from '@/lib/overlayAnimations'
import { buildImagePreviewStyles } from '@/lib/imagePreviewStyles'
import {
  activePreviewOverlays,
  overlayPreviewZIndex,
} from '@/lib/overlayPreview'
import {
  ArrowFlowOverlay,
  ConflictBoxOverlay,
  DataCardOverlay,
  UpperThirdLabelOverlay,
} from '@/components/editor/player/MotionGraphicOverlays'
import { MotionGraphicProPreview } from '@/components/editor/player/MotionGraphicsProOverlays'
import { isMotionGraphicProType } from '@/lib/motionGraphicsLibrary'
import { motionGraphicIsFullscreen } from '@/lib/motionGraphicEdit'
import {
  AreaChartOverlay,
  ChecklistOverlay,
  CycleDiagramOverlay,
  DecisionTreeOverlay,
  FlowchartOverlay,
  FunnelChartOverlay,
  GanttChartOverlay,
  GaugeChartOverlay,
  HorizontalBarOverlay,
  MindMapOverlay,
  OrgChartOverlay,
  PieChartOverlay,
  ProcessFlowOverlay,
  ProcessStepsOverlay,
  ProgressBarOverlay,
  StackedBarOverlay,
  SwimLaneOverlay,
  TimelineStepsOverlay,
} from '@/components/editor/player/ChartProcessOverlays'
import { isChartOrProcessClip } from '@/lib/chartVisualTypes'

function activeOverlays(clips: Clip[], time: number): Clip[] {
  return activePreviewOverlays(clips, time)
}

function isImageMedia(clip: Clip, url: string): boolean {
  if (clip.effects?.mediaKind === 'image') return true
  if (clip.effects?.mediaKind === 'video') return false
  return /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url)
}

function ImageSlotOverlay({ clip }: { clip: Clip }) {
  const url = clip.effects?.mediaUrl
  const shapeColor = clip.effects?.displayValue || '#3B82F6'
  const vt = (clip.effects?.visualType ?? '').toLowerCase()

  if (vt === 'image_shape' && !url) {
    return (
      <div
        data-testid={`visual-overlay-${clip.id}`}
        className="w-full h-full rounded-lg opacity-90"
        style={{ background: shapeColor }}
      />
    )
  }

  if (url) {
    const imgStyles = buildImagePreviewStyles(clip)
    return (
      <div data-testid={`visual-overlay-${clip.id}`} className="w-full h-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="w-full h-full drop-shadow-lg" style={imgStyles} />
      </div>
    )
  }

  return (
    <div
      data-testid={`visual-overlay-${clip.id}`}
      className="w-full h-full rounded-lg border-2 border-dashed border-white/40 bg-black/40 flex items-center justify-center text-[10px] text-white/60 px-2 text-center"
    >
      Drop image
    </div>
  )
}

interface OverlayCardProps {
  clip: Clip
  primary: string
  accent: string
}

function StatisticOverlay({ clip, primary, accent }: OverlayCardProps) {
  const value = clip.effects?.displayValue || clip.label
  const label = clip.effects?.secondaryText || clip.effects?.nepaliLabel || ''
  return (
    <div
      data-testid={`visual-overlay-${clip.id}`}
      className="pointer-events-none max-w-[85%]"
    >
      <div
        className="rounded-2xl px-6 py-4 shadow-2xl border border-white/10 backdrop-blur-md"
        style={{
          background: `linear-gradient(135deg, ${primary}ee 0%, ${primary}99 100%)`,
        }}
      >
        <div className="flex items-end gap-4">
          <span
            className="text-4xl md:text-5xl font-black text-white tabular-nums leading-none"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}
          >
            {value}
          </span>
          {label && (
            <span className="text-sm md:text-base text-white/90 font-nepali pb-1">{label}</span>
          )}
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-black/20 overflow-hidden">
          <div
            className="h-full rounded-full animate-pulse"
            style={{ width: '72%', background: accent }}
          />
        </div>
      </div>
    </div>
  )
}

function LargeNumberOverlay({ clip, primary }: OverlayCardProps) {
  const value = clip.effects?.displayValue || clip.label
  return (
    <div
      data-testid={`visual-overlay-${clip.id}`}
      className="pointer-events-none text-center"
    >
      <div
        className="inline-block px-8 py-6 rounded-3xl"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${primary} 0%, #111 70%)`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        <span className="text-5xl md:text-6xl font-black text-white tabular-nums block">
          {value}
        </span>
      </div>
    </div>
  )
}

function ListOverlay({ clip, primary, accent }: OverlayCardProps) {
  const lines = (clip.effects?.displayValue || clip.label).split(/[,|•\n]/).map((s) => s.trim()).filter(Boolean)
  return (
    <div
      data-testid={`visual-overlay-${clip.id}`}
      className="pointer-events-none max-w-[80%]"
    >
      <div className="rounded-xl px-5 py-4 bg-black/75 backdrop-blur-md border border-white/10">
        <ul className="space-y-2">
          {lines.slice(0, 4).map((line, i) => (
            <li key={i} className="flex items-start gap-2 text-white text-sm md:text-base">
              <span className="mt-1 w-2 h-2 rounded-full flex-shrink-0" style={{ background: accent }} />
              <span className={i === 0 ? 'font-semibold' : ''}>{line}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 h-0.5 rounded" style={{ background: `linear-gradient(90deg, ${primary}, transparent)` }} />
      </div>
    </div>
  )
}

function ComparisonOverlay({ clip, primary, accent }: OverlayCardProps) {
  const parts = (clip.effects?.displayValue || 'Option A | Option B').split(/\||vs/i)
  const left = parts[0]?.trim() || 'Option A'
  const right = parts[1]?.trim() || 'Option B'
  const headerParts = (clip.effects?.secondaryText || 'Before|After').split('|')
  const leftHeader = headerParts[0]?.trim() || 'Before'
  const rightHeader = headerParts[1]?.trim() || 'After'
  return (
    <div data-testid={`visual-overlay-${clip.id}`} className="pointer-events-none w-[85%] max-w-lg">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg p-3 bg-white/10 backdrop-blur border border-white/20 text-center">
          <p className="text-[10px] uppercase tracking-wider text-white/60 mb-1">{leftHeader}</p>
          <p className="text-sm font-semibold text-white">{left}</p>
        </div>
        <div
          className="rounded-lg p-3 backdrop-blur border text-center"
          style={{ background: `${primary}44`, borderColor: accent }}
        >
          <p className="text-[10px] uppercase tracking-wider text-white/80 mb-1">{rightHeader}</p>
          <p className="text-sm font-bold text-white">{right}</p>
        </div>
      </div>
    </div>
  )
}

function LowerThirdOverlay({ clip, primary }: OverlayCardProps) {
  const text =
    clip.effects?.displayValue || clip.effects?.secondaryText || clip.effects?.nepaliLabel || clip.label
  return (
    <div
      data-testid={`visual-overlay-${clip.id}`}
      className="pointer-events-none flex justify-start"
    >
      <div
        className="flex items-center gap-3 pl-4 pr-6 py-2 rounded-r-lg"
        style={{
          background: `linear-gradient(90deg, ${primary} 0%, ${primary}cc 100%)`,
          borderLeft: '4px solid white',
        }}
      >
        <span className="text-sm md:text-base font-semibold text-white font-nepali">{text}</span>
      </div>
    </div>
  )
}

function CtaOverlay({ clip, accent }: OverlayCardProps) {
  const text = clip.effects?.displayValue || 'Subscribe now'
  return (
    <div data-testid={`visual-overlay-${clip.id}`} className="pointer-events-none">
      <div
        className="px-6 py-3 rounded-full font-bold text-sm md:text-base text-black shadow-lg animate-pulse"
        style={{ background: accent, boxShadow: `0 0 24px ${accent}88` }}
      >
        {text}
      </div>
    </div>
  )
}

function TitleBannerOverlay({ clip }: OverlayCardProps) {
  const text = clip.effects?.displayValue || clip.label || 'Your hook headline'
  return (
    <div
      data-testid={`visual-overlay-${clip.id}`}
      className="pointer-events-none w-full px-2"
    >
      <div className="w-full bg-black/90 border-y border-white/20 py-3 px-4 text-center">
        <p className="text-sm md:text-base font-black text-white uppercase tracking-wide leading-snug">
          {text}
        </p>
      </div>
    </div>
  )
}

/** Full-screen B-roll layer — solid black until media is attached. */
function BrollMediaOverlay({ clip }: OverlayCardProps) {
  const mediaUrl = clip.effects?.mediaUrl
  if (mediaUrl) {
    if (isImageMedia(clip, mediaUrl)) {
      return (
        <div data-testid={`visual-overlay-${clip.id}`} className="w-full h-full bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )
    }
    return (
      <div data-testid={`visual-overlay-${clip.id}`} className="w-full h-full bg-black">
        <video
          src={mediaUrl}
          className="w-full h-full object-cover"
          muted
          playsInline
          autoPlay
          loop
        />
      </div>
    )
  }
  return (
    <div
      data-testid={`visual-overlay-${clip.id}`}
      className="w-full h-full bg-black"
      aria-label="B-Roll empty slot"
    />
  )
}

function HookOverlay({ clip, primary }: OverlayCardProps) {
  const text =
    clip.effects?.displayValue || clip.effects?.secondaryText || clip.effects?.nepaliLabel || clip.label
  return (
    <div data-testid={`visual-overlay-${clip.id}`} className="pointer-events-none max-w-[90%] text-center px-4">
      <p
        className="text-xl md:text-2xl font-black text-white leading-tight font-nepali"
        style={{ textShadow: `0 2px 20px ${primary}, 0 0 40px rgba(0,0,0,0.8)` }}
      >
        {text}
      </p>
    </div>
  )
}

function BarChartOverlay({ clip, primary, accent }: OverlayCardProps) {
  const title = clip.effects?.displayValue || clip.label
  const subtitle = clip.effects?.secondaryText || ''
  const bars = [40, 65, 55, 80, 72, 90]
  return (
    <div data-testid={`visual-overlay-${clip.id}`} className="pointer-events-none w-[85%] max-w-md">
      <div className="rounded-2xl px-5 py-4 bg-black/80 backdrop-blur-md border border-white/10">
        <p className="text-sm font-semibold text-white mb-0.5">{title}</p>
        {subtitle && <p className="text-[10px] text-white/60 mb-3">{subtitle}</p>}
        <div className="flex items-end gap-1.5 h-16">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm"
              style={{
                height: `${h}%`,
                background: i === bars.length - 1 ? accent : `${primary}99`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function LineChartOverlay({ clip, primary, accent }: OverlayCardProps) {
  const title = clip.effects?.displayValue || clip.label
  const subtitle = clip.effects?.secondaryText || ''
  return (
    <div data-testid={`visual-overlay-${clip.id}`} className="pointer-events-none w-[85%] max-w-md">
      <div className="rounded-2xl px-5 py-4 bg-black/75 backdrop-blur-md border border-white/10">
        <p className="text-sm font-semibold text-white">{title}</p>
        {subtitle && <p className="text-xs text-emerald-400 font-bold mt-0.5">{subtitle}</p>}
        <svg viewBox="0 0 120 40" className="w-full h-12 mt-2" aria-hidden="true">
          <polyline
            fill="none"
            stroke={accent}
            strokeWidth="2.5"
            points="0,35 20,28 40,32 60,18 80,22 100,8 120,12"
          />
          <polyline
            fill={`${primary}33`}
            stroke="none"
            points="0,35 20,28 40,32 60,18 80,22 100,8 120,12 120,40 0,40"
          />
        </svg>
      </div>
    </div>
  )
}

function DonutChartOverlay({ clip, primary, accent }: OverlayCardProps) {
  const value = clip.effects?.displayValue || '68%'
  const subtitle = clip.effects?.secondaryText || ''
  return (
    <div data-testid={`visual-overlay-${clip.id}`} className="pointer-events-none">
      <div className="relative w-32 h-32 md:w-36 md:h-36">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="14" fill="none" stroke="#ffffff22" strokeWidth="4" />
          <circle
            cx="18" cy="18" r="14" fill="none"
            stroke={accent}
            strokeWidth="4"
            strokeDasharray="68 100"
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-white">{value}</span>
          {subtitle && <span className="text-[9px] text-white/70 text-center px-2">{subtitle}</span>}
        </div>
      </div>
    </div>
  )
}

function EmojiElementOverlay({ clip }: { clip: Clip }) {
  const emoji = clip.effects?.emoji || clip.effects?.displayValue || '⭐'
  const scale = clip.effects?.scale ?? 1.5
  return (
    <div
      data-testid={`visual-overlay-${clip.id}`}
      className="pointer-events-none"
      style={{ fontSize: `${3 * scale}rem`, lineHeight: 1, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' }}
    >
      {emoji}
    </div>
  )
}

interface ScaleCorner {
  id: string
  cx: number
  cy: number
  positionClass: string
  cursorClass: string
}

const SCALE_CORNERS: ScaleCorner[] = [
  { id: 'se', cx: 1,  cy: 1,  positionClass: '-bottom-1.5 -right-1.5', cursorClass: 'cursor-nwse-resize' },
  { id: 'sw', cx: -1, cy: 1,  positionClass: '-bottom-1.5 -left-1.5',  cursorClass: 'cursor-nesw-resize' },
  { id: 'ne', cx: 1,  cy: -1, positionClass: '-top-1.5 -right-1.5',    cursorClass: 'cursor-nesw-resize' },
  { id: 'nw', cx: -1, cy: -1, positionClass: '-top-1.5 -left-1.5',     cursorClass: 'cursor-nwse-resize' },
]

interface ResizeState {
  startX: number
  startY: number
  origW: number
  origH: number
  origScale: number
  origX: number
  origY: number
  lockAspect: boolean
  cx: number
  cy: number
}

function PositionedOverlay({
  clip,
  children,
  interactive,
  currentTime,
}: {
  clip: Clip
  children: React.ReactNode
  interactive?: boolean
  currentTime: number
}) {
  const updateOverlayClip = useTimelineStore((s) => s.updateOverlayClip)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  const x = clip.effects?.xPct ?? 50
  const y = clip.effects?.yPct ?? 50
  const scale = clip.effects?.scale ?? 1
  const mode = clip.effects?.overlayMode ?? 'corner'
  const widthPct = clip.effects?.widthPct
  const heightPct = clip.effects?.heightPct
  const rotation = clip.effects?.rotation ?? 0
  const isImageOverlay = isImageClip(clip)
  const isChartOverlay = isChartOrProcessClip(clip)
  const imageHidden = isImageOverlay && clip.effects?.imageVisible === false
  const imageLocked = isImageOverlay && clip.effects?.imageLocked === true
  const imageOpacity = isImageOverlay ? (clip.effects?.imageOpacity ?? 100) / 100 : 1
  const { opacity: motionOpacity, motionTransform } = computeOverlayMotion(clip, currentTime)
  const isResizable = interactive && mode !== 'fullscreen' && !isChartOverlay && !imageLocked
  const resizeRef = useRef<ResizeState | null>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive || imageLocked) return
      e.stopPropagation()
      dragRef.current = { startX: e.clientX, startY: e.clientY, origX: x, origY: y }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [interactive, imageLocked, x, y],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive || !dragRef.current || !containerRef.current?.parentElement) return
      const parent = containerRef.current.parentElement.getBoundingClientRect()
      const dx = ((e.clientX - dragRef.current.startX) / parent.width) * 100
      const dy = ((e.clientY - dragRef.current.startY) / parent.height) * 100
      updateOverlayClip(clip.id, {
        xPct: Math.max(0, Math.min(100, dragRef.current.origX + dx)),
        yPct: Math.max(0, Math.min(100, dragRef.current.origY + dy)),
      })
    },
    [interactive, clip.id, updateOverlayClip],
  )

  const onPointerUp = useCallback(() => {
    dragRef.current = null
    resizeRef.current = null
  }, [])

  const onScaleDown = useCallback(
    (cx: number, cy: number) => (e: React.PointerEvent) => {
      if (!interactive || imageLocked) return
      e.stopPropagation()
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origW: widthPct ?? 30,
        origH: heightPct ?? 20,
        origScale: scale,
        origX: x,
        origY: y,
        lockAspect: clip.effects?.lockAspectRatio ?? true,
        cx,
        cy,
      }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [interactive, imageLocked, widthPct, heightPct, scale, x, y, clip.effects?.lockAspectRatio],
  )

  const onScaleMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeRef.current || !containerRef.current?.parentElement) return
      const parent = containerRef.current.parentElement.getBoundingClientRect()
      const dxFrac = (e.clientX - resizeRef.current.startX) / parent.width
      const dyFrac = (e.clientY - resizeRef.current.startY) / parent.height
      const vt = (clip.effects?.visualType ?? '').toLowerCase()
      const isImageType = vt === 'conflict_box' || vt === 'image_slot' || vt === 'image_sticker' || vt === 'image_shape'

      if (isImageType || vt === 'arrow_flow') {
        const r = resizeRef.current
        const dx = dxFrac * 100
        const dy = dyFrac * 100

        let dw = r.cx * dx
        let dh = r.cy * dy

        if (r.lockAspect && r.origW > 0 && r.origH > 0) {
          const aspect = r.origW / r.origH
          if (Math.abs(dw) / aspect > Math.abs(dh)) {
            dh = dw / aspect
          } else {
            dw = dh * aspect
          }
        }

        const newW = Math.max(8, Math.min(95, r.origW + dw))
        const newH = Math.max(8, Math.min(95, r.origH + dh))

        updateOverlayClip(clip.id, {
          widthPct: newW,
          heightPct: vt === 'arrow_flow' ? undefined : newH,
          xPct: Math.max(0, Math.min(100, r.origX + (newW - r.origW) / 2)),
          yPct: Math.max(0, Math.min(100, r.origY + (newH - r.origH) / 2)),
        })
      } else {
        const delta = (dxFrac + dyFrac) / 2
        updateOverlayClip(clip.id, {
          scale: Math.max(0.4, Math.min(3, resizeRef.current.origScale + delta * 4)),
        })
      }
    },
    [clip.effects?.visualType, clip.id, updateOverlayClip],
  )

  const baseTransform =
    mode === 'fullscreen'
      ? `rotate(${rotation}deg) scale(${scale})`
      : `translate(-50%, -50%) ${motionTransform} scale(${scale}) rotate(${rotation}deg)`

  const style: React.CSSProperties =
    mode === 'fullscreen'
      ? {
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          transform: baseTransform,
          transformOrigin: 'center center',
          opacity: imageHidden ? 0 : motionOpacity * imageOpacity,
        }
      : {
          left: `${x}%`,
          top: `${y}%`,
          width: widthPct ? `${widthPct}%` : undefined,
          height: heightPct ? `${heightPct}%` : undefined,
          transform: baseTransform,
          opacity: imageHidden ? 0 : motionOpacity * imageOpacity,
        }

  return (
    <div
      ref={containerRef}
      className={interactive ? 'absolute pointer-events-auto' : 'absolute pointer-events-none'}
      style={style}
      onPointerMove={(e) => {
        onPointerMove(e)
        onScaleMove(e)
      }}
      onPointerUp={onPointerUp}
      data-testid={interactive ? `overlay-draggable-${clip.id}` : undefined}
    >
      {/* Selection border */}
      {interactive && !imageLocked && (
        <div
          className="absolute -inset-[1.5px] rounded pointer-events-none border-2 border-accent/60 z-0"
          aria-hidden="true"
        />
      )}

      <div
        className={interactive && !imageLocked ? 'cursor-grab active:cursor-grabbing relative z-[1]' : 'relative z-[1]'}
        onPointerDown={onPointerDown}
      >
        {children}
      </div>

      {/* Corner scale handles */}
      {interactive && isResizable && (
        <>
          {SCALE_CORNERS.map((corner) => (
            <div
              key={corner.id}
              data-testid={`overlay-scale-handle-${clip.id}-${corner.id}`}
              className={`absolute ${corner.positionClass} w-3 h-3 rounded-full bg-white border-2 border-accent ${corner.cursorClass} shadow-md z-10`}
              onPointerDown={onScaleDown(corner.cx, corner.cy)}
              aria-label={`Scale ${corner.id}`}
            />
          ))}
        </>
      )}
    </div>
  )
}

function OverlayRenderer({
  clip,
  primary,
  accent,
  interactive,
  currentTime,
}: OverlayCardProps & { interactive?: boolean; currentTime: number }) {
  if (isBrollClip(clip)) {
    return (
      <PositionedOverlay clip={clip} interactive={false} currentTime={currentTime}>
        <BrollMediaOverlay clip={clip} primary={primary} accent={accent} />
      </PositionedOverlay>
    )
  }

  if (isImageClip(clip)) {
    return (
      <PositionedOverlay clip={clip} interactive={interactive} currentTime={currentTime}>
        <ImageSlotOverlay clip={clip} />
      </PositionedOverlay>
    )
  }

  const vt = (clip.effects?.visualType || '').toLowerCase()
  let inner: React.ReactNode

  if (isMotionGraphicProType(vt)) {
    const isFullscreen = motionGraphicIsFullscreen(vt)
    const mgProps = {
      clip,
      currentTime,
      primary,
      accent,
      interactive,
      embedded: !isFullscreen,
    }
    if (isFullscreen) {
      return (
        <div
          className={interactive ? 'absolute inset-0 pointer-events-auto' : 'absolute inset-0 pointer-events-none'}
        >
          {interactive && (
            <div className="absolute inset-0 border-2 border-accent/60 pointer-events-none rounded-sm" aria-hidden />
          )}
          <MotionGraphicProPreview {...mgProps} embedded={false} />
        </div>
      )
    }
    return (
      <PositionedOverlay clip={clip} interactive={interactive} currentTime={currentTime}>
        <MotionGraphicProPreview {...mgProps} />
      </PositionedOverlay>
    )
  }

  if (vt === 'emoji_element') inner = <EmojiElementOverlay clip={clip} />
  else if (vt === 'bar_chart') inner = <BarChartOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'horizontal_bar') inner = <HorizontalBarOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'stacked_bar') inner = <StackedBarOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'line_chart') inner = <LineChartOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'area_chart') inner = <AreaChartOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'donut_chart') inner = <DonutChartOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'pie_chart') inner = <PieChartOverlay clip={clip} accent={accent} />
  else if (vt === 'gauge_chart') inner = <GaugeChartOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'progress_bar') inner = <ProgressBarOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'flowchart') inner = <FlowchartOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'process_flow') inner = <ProcessFlowOverlay clip={clip} accent={accent} />
  else if (vt === 'funnel_chart') inner = <FunnelChartOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'timeline_steps') inner = <TimelineStepsOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'process_steps') inner = <ProcessStepsOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'cycle_diagram') inner = <CycleDiagramOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'org_chart') inner = <OrgChartOverlay clip={clip} primary={primary} />
  else if (vt === 'checklist') inner = <ChecklistOverlay clip={clip} accent={accent} />
  else if (vt === 'gantt_chart') inner = <GanttChartOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'swim_lane') inner = <SwimLaneOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'decision_tree') inner = <DecisionTreeOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'mind_map') inner = <MindMapOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'large_number') inner = <LargeNumberOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'list_item') inner = <ListOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'comparison') inner = <ComparisonOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'key_term') inner = <LowerThirdOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'cta' || vt === 'add_cta') inner = <CtaOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'title_banner' || vt === 'hook_banner') inner = <TitleBannerOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'hook_rewrite') inner = <HookOverlay clip={clip} primary={primary} accent={accent} />
  else if (vt === 'data_card') inner = <DataCardOverlay clip={clip} primary={primary} accent={accent} interactive={interactive} />
  else if (vt === 'arrow_flow') inner = <ArrowFlowOverlay clip={clip} primary={primary} accent={accent} interactive={interactive} />
  else if (vt === 'conflict_box') inner = <ConflictBoxOverlay clip={clip} primary={primary} accent={accent} interactive={interactive} />
  else if (vt === 'upper_third_label') inner = <UpperThirdLabelOverlay clip={clip} primary={primary} accent={accent} interactive={interactive} />
  else inner = <StatisticOverlay clip={clip} primary={primary} accent={accent} />

  const chartInteractive = interactive && clip.effects?.overlayMode !== 'fullscreen'

  return (
    <PositionedOverlay clip={clip} interactive={chartInteractive} currentTime={currentTime}>
      {inner}
    </PositionedOverlay>
  )
}

export function VisualOverlayLayer() {
  const clips = useTimelineStore((s) => s.clips)
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const brand = useVisualLibraryStore((s) => s.brandKit)

  const overlays = useMemo(
    () => activeOverlays(clips, currentTime),
    [clips, currentTime],
  )

  if (overlays.length === 0) return null

  const primary = brand.primaryColor || '#C41E3A'
  const accent = brand.accentColor || '#F59E0B'

  return (
    <div
      data-testid="visual-overlay-layer"
      className="absolute inset-0 z-20 overflow-hidden"
      aria-hidden="true"
    >
      {overlays.map((clip) => {
        const interactive = selectedClipIds.includes(clip.id)
        return (
          <div
            key={clip.id}
            className={`absolute inset-0 ${interactive ? 'pointer-events-auto' : 'pointer-events-none'}`}
            style={{ zIndex: overlayPreviewZIndex(clip) }}
          >
            <OverlayRenderer
              clip={clip}
              primary={primary}
              accent={accent}
              interactive={interactive}
              currentTime={currentTime}
            />
          </div>
        )
      })}
    </div>
  )
}
