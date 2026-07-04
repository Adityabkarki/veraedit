'use client'

/**
 * Remotion-parity preview for pro motion graphics (CSS approximations).
 */

import type { Clip } from '@/stores/timelineStore'
import {
  elementLocalTime,
  enterProgress,
  exitProgress,
  seededRandom,
  containsDevanagari,
} from '@/lib/motionMath'
import { getMotionGraphicDef } from '@/lib/motionGraphicsLibrary'

interface ProOverlayProps {
  clip: Clip
  currentTime: number
  primary: string
  accent: string
  embedded?: boolean
  interactive?: boolean
}

function readProps(clip: Clip): Record<string, unknown> {
  const base = (clip.effects?.motionProps as Record<string, unknown>) ?? {}
  return {
    ...base,
    text: base.text ?? clip.effects?.displayValue ?? '',
    title: base.title ?? clip.effects?.displayValue ?? '',
    subtitle: base.subtitle ?? clip.effects?.secondaryText ?? '',
    label: base.label ?? clip.effects?.secondaryText ?? '',
    brandColor: base.brandColor ?? clip.effects?.brandColor ?? '#3B82F6',
  }
}

function fontFamilyFor(text: string): string {
  return containsDevanagari(String(text)) ? 'Noto Sans Devanagari, sans-serif' : 'inherit'
}

function Positioned({
  clip,
  children,
  opacity = 1,
  transform = '',
  embedded = false,
}: {
  clip: Clip
  children: React.ReactNode
  opacity?: number
  transform?: string
  embedded?: boolean
}) {
  if (embedded) {
    return (
      <div style={{ opacity, transform, maxWidth: '100%', textAlign: 'center' }}>
        {children}
      </div>
    )
  }
  const x = clip.effects?.xPct ?? 50
  const y = clip.effects?.yPct ?? 50
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) ${transform}`,
        opacity,
        maxWidth: '90%',
      }}
    >
      {children}
    </div>
  )
}

function useMotionTiming(clip: Clip, currentTime: number) {
  const start = clip.startTime
  const end = clip.startTime + clip.duration
  const { local, duration, active } = elementLocalTime(currentTime, start, end)
  const enterAnim = clip.effects?.motionEnter ?? 'fade'
  const exitAnim = clip.effects?.motionExit ?? 'fade'
  const enterDur = clip.effects?.motionEnterDuration ?? 0.5
  const exitDur = clip.effects?.motionExitDuration ?? 0.35
  const enter = enterProgress(local, enterDur, enterAnim)
  const exit = exitProgress(local, duration, exitDur, exitAnim)
  return { local, duration, active, enter, exit, opacity: enter * exit }
}

export function AnimatedTitleProPreview({ clip, currentTime, accent, embedded }: ProOverlayProps) {
  const { active, opacity } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const text = String(props.text ?? '')
  const words = text.split(/\s+/).filter(Boolean)
  const color = String(props.color ?? '#FFFFFF')
  const fontSize = Number(props.fontSize ?? 48)

  return (
    <Positioned clip={clip} opacity={opacity} embedded={embedded}>
      <div className="flex flex-wrap justify-center gap-1" style={{ fontFamily: fontFamilyFor(text) }}>
        {words.map((w, i) => (
          <span
            key={i}
            className="font-black inline-block motion-gfx-word-pop"
            style={{
              fontSize,
              color: i === words.length - 1 ? accent : color,
              WebkitTextStroke: '2px #000',
              animationDelay: `${i * 0.08}s`,
            }}
          >
            {w}
          </span>
        ))}
      </div>
    </Positioned>
  )
}

export function KineticTextProPreview({ clip, currentTime, accent, embedded }: ProOverlayProps) {
  const { active, local, duration, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const text = String(props.text ?? '')
  const words = text.split(/\s+/).filter(Boolean)
  const wordDur = duration / Math.max(1, words.length)

  return (
    <Positioned clip={clip} opacity={exit} embedded={embedded}>
      <div className="flex flex-wrap justify-center gap-1" style={{ fontFamily: fontFamilyFor(text) }}>
        {words.map((w, i) => {
          const visible = local >= i * wordDur
          return (
            <span
              key={i}
              className={`font-black inline-block ${visible ? 'motion-gfx-kinetic-pop' : ''}`}
              style={{
                fontSize: Number(props.fontSize ?? 40),
                color: visible ? accent : String(props.color ?? '#fff'),
                opacity: visible ? 1 : 0.35,
                WebkitTextStroke: '2px #000',
              }}
            >
              {w}
            </span>
          )
        })}
      </div>
    </Positioned>
  )
}

export function LowerThirdProPreview({ clip, currentTime, primary, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const brand = String(props.brandColor ?? primary)

  const inner = (
    <div
      className="px-4 py-2 rounded-lg shadow-xl motion-gfx-lower-third"
      style={{
        opacity: enter * exit,
        transform: embedded ? undefined : `translateX(${(1 - enter) * -80}px)`,
        background: `${brand}dd`,
        fontFamily: fontFamilyFor(String(props.title)),
      }}
    >
      <div className="text-lg font-bold text-white">{String(props.title ?? '')}</div>
      {props.subtitle && (
        <div className="text-sm text-white/85">{String(props.subtitle)}</div>
      )}
    </div>
  )

  if (embedded) return inner

  return (
    <div
      className="absolute left-6 bottom-[12%] motion-gfx-lower-third"
      style={{ opacity: enter * exit, transform: `translateX(${(1 - enter) * -80}px)` }}
    >
      {inner}
    </div>
  )
}

export function StatCounterProPreview({ clip, currentTime, primary, embedded }: ProOverlayProps) {
  const { active, local, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const target = Number(props.value ?? 1000)
  const progress = enterProgress(local, clip.effects?.motionEnterDuration ?? 0.8, 'count_up')
  const display = Math.round(target * progress)

  return (
    <Positioned clip={clip} opacity={exit} embedded={embedded}>
      <div className="text-center">
        <div className="text-4xl font-black tabular-nums" style={{ color: String(props.brandColor ?? primary) }}>
          {String(props.prefix ?? '')}{display.toLocaleString()}{String(props.suffix ?? '')}
        </div>
        {props.label && (
          <div className="text-xs font-bold uppercase tracking-widest text-white/80 mt-1">
            {String(props.label)}
          </div>
        )}
      </div>
    </Positioned>
  )
}

export function CtaBadgeProPreview({ clip, currentTime, embedded }: ProOverlayProps) {
  const { active, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)

  return (
    <Positioned clip={clip} opacity={exit} embedded={embedded}>
      <div
        className="px-6 py-2 rounded-full font-bold text-sm motion-gfx-cta-pulse"
        style={{
          background: String(props.brandColor ?? '#EF4444'),
          color: String(props.textColor ?? '#fff'),
        }}
      >
        {String(props.text ?? 'Subscribe')}
      </div>
    </Positioned>
  )
}

export function EndCardProPreview({ clip, currentTime, primary }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const translateY = (1 - enter) * 40

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
      style={{
        opacity: enter * exit,
        transform: `translateY(${translateY}px)`,
        background: `linear-gradient(180deg, transparent, ${String(props.brandColor ?? primary)}33)`,
      }}
    >
      <div className="text-center" style={{ fontFamily: fontFamilyFor(String(props.title)) }}>
        <div className="text-2xl font-black text-white">{String(props.title ?? '')}</div>
        {props.subtitle && <div className="text-sm text-white/80 mt-2">{String(props.subtitle)}</div>}
        {props.handle && (
          <div className="text-base font-bold mt-3" style={{ color: String(props.brandColor ?? primary) }}>
            {String(props.handle)}
          </div>
        )}
      </div>
    </div>
  )
}

export function QuoteCalloutProPreview({ clip, currentTime, primary, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const translateY = (1 - enter) * 20

  return (
    <Positioned clip={clip} opacity={enter * exit} embedded={embedded} transform={`translateY(${translateY}px)`}>
      <div className="max-w-md text-center italic text-white text-lg px-4">
        <span className="text-4xl opacity-50" style={{ color: String(props.brandColor ?? primary) }}>
          "
        </span>
        {String(props.text ?? '')}
        {props.author && <div className="text-sm not-italic mt-2 opacity-70">— {String(props.author)}</div>}
      </div>
    </Positioned>
  )
}

export function ProgressTimerProPreview({ clip, currentTime, primary, embedded }: ProOverlayProps) {
  const { active, local, duration, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const fill = enterProgress(local, duration * 0.9, 'fill')

  const inner = (
    <div className="w-full pointer-events-none" style={{ opacity: exit, minWidth: embedded ? 280 : undefined }}>
      {props.label && <div className="text-xs font-bold text-white mb-1">{String(props.label)}</div>}
      <div className="h-1.5 bg-white/20 rounded overflow-hidden">
        <div
          className="h-full rounded"
          style={{ width: `${fill * 100}%`, background: String(props.brandColor ?? primary) }}
        />
      </div>
    </div>
  )

  if (embedded) return inner

  return (
    <div className="absolute left-6 right-6 bottom-[8%] pointer-events-none" style={{ opacity: exit }}>
      {inner}
    </div>
  )
}

export function ParticleBurstProPreview({ clip, currentTime }: ProOverlayProps) {
  const { active, local, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const count = Number(props.particleCount ?? 24)
  const colors = (props.colors as string[]) ?? ['#FFD600', '#FF6B00']
  const seed = Number(props.seed ?? 42)
  const burstT = Math.min(1, local / 0.8)

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: count }).map((_, i) => {
        const angle = seededRandom(seed, i) * Math.PI * 2
        const dist = 40 + seededRandom(seed, i + 50) * 120
        const x = 50 + Math.cos(angle) * dist * burstT
        const y = 50 + Math.sin(angle) * dist * burstT
        const size = 4 + seededRandom(seed, i + 100) * 8
        return (
          <div
            key={i}
            className="absolute rounded-sm"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              background: colors[i % colors.length],
              opacity: (1 - burstT) * exit,
            }}
          />
        )
      })}
    </div>
  )
}

function BackgroundGradientProPreview({ clip, currentTime }: ProOverlayProps) {
  const { active } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  return (
    <div
      className="absolute inset-0 pointer-events-none opacity-30 motion-gfx-gradient-shift"
      style={{
        background: `linear-gradient(135deg, ${String(props.colorA)}, ${String(props.colorB)})`,
      }}
    />
  )
}

function ShapeTransitionProPreview({ clip, currentTime }: ProOverlayProps) {
  const { active, local, duration } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const progress = enterProgress(local, Math.min(duration, 0.8), 'wipe')
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: String(props.color ?? '#000'),
        clipPath: `inset(0 ${100 - progress * 100}% 0 0)`,
      }}
    />
  )
}

function ArrowCalloutProPreview({ clip, currentTime, accent, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  return (
    <Positioned clip={clip} opacity={exit} embedded={embedded}>
      <div style={{ transform: `rotate(${Number(props.angle ?? 0)}deg)` }}>
        <div
          className="h-1 rounded motion-gfx-arrow-draw"
          style={{
            width: `${enter * 120}px`,
            background: String(props.brandColor ?? accent),
          }}
        />
        {props.text && <div className="text-xs font-bold text-white mt-1">{String(props.text)}</div>}
      </div>
    </Positioned>
  )
}

export function MotionGraphicProPreview({ clip, currentTime, primary, accent, embedded, interactive }: ProOverlayProps) {
  const vt = (clip.effects?.visualType ?? '').toLowerCase()
  const common = { clip, currentTime, primary, accent, embedded, interactive }

  switch (vt) {
    case 'animated_title':
      return <AnimatedTitleProPreview {...common} />
    case 'kinetic_text':
      return <KineticTextProPreview {...common} />
    case 'lower_third_pro':
      return <LowerThirdProPreview {...common} />
    case 'stat_counter':
      return <StatCounterProPreview {...common} />
    case 'cta_badge':
      return <CtaBadgeProPreview {...common} />
    case 'end_card':
      return <EndCardProPreview {...common} />
    case 'quote_callout':
      return <QuoteCalloutProPreview {...common} />
    case 'progress_timer':
      return <ProgressTimerProPreview {...common} />
    case 'particle_burst':
      return <ParticleBurstProPreview {...common} />
    case 'background_gradient':
      return <BackgroundGradientProPreview clip={clip} currentTime={currentTime} />
    case 'shape_transition':
      return <ShapeTransitionProPreview clip={clip} currentTime={currentTime} />
    case 'arrow_callout':
      return <ArrowCalloutProPreview clip={clip} currentTime={currentTime} accent={accent} />
    default:
      return (
        <Positioned clip={clip}>
          <div className="text-xs text-white/60 bg-black/50 px-2 py-1 rounded">
            {getMotionGraphicDef(vt)?.label ?? vt}
          </div>
        </Positioned>
      )
  }
}
