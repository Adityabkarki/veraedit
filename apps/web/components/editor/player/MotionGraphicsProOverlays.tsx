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
  const { active, exit, enter } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const text = String(props.text ?? '')
  const words = text.split(/\s+/).filter(Boolean)
  const color = String(props.color ?? '#FFFFFF')
  const accentColor = String(props.accentColor ?? accent)
  const fontSize = Number(props.fontSize ?? 48)
  const showStroke = props.showAccentStroke !== false

  return (
    <Positioned clip={clip} opacity={exit} embedded={embedded}>
      <div className="flex flex-col items-center gap-1.5" style={{ fontFamily: fontFamilyFor(text) }}>
        <div className="flex flex-wrap justify-center gap-1">
          {words.map((w, i) => (
            <span
              key={i}
              className="font-black inline-block motion-gfx-word-pop"
              style={{
                fontSize,
                color: i === words.length - 1 ? accentColor : color,
                WebkitTextStroke: '2px #000',
                animationDelay: `${i * 0.08}s`,
                transform: `translateY(${(1 - enter) * 12}px)`,
              }}
            >
              {w}
            </span>
          ))}
        </div>
        {showStroke && (
          <div
            className="h-1 rounded-full"
            style={{
              width: `${enter * Math.max(48, fontSize * 1.6)}px`,
              background: accentColor,
              boxShadow: `0 0 10px ${accentColor}88`,
            }}
          />
        )}
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

function asNumberList(val: unknown, fallback: number[]): number[] {
  if (!Array.isArray(val)) return fallback
  const nums = val.map((x) => Number(x)).filter((n) => Number.isFinite(n))
  return nums.length ? nums : fallback
}

function asStringList(val: unknown, fallback: string[]): string[] {
  if (!Array.isArray(val)) return fallback
  const labels = val.map((x) => String(x))
  return labels.length ? labels : fallback
}

function BarChartProPreview({ clip, currentTime, primary, accent, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const labels = asStringList(props.labels, ['A', 'B', 'C'])
  const values = asNumberList(props.values, [40, 70, 55])
  const maxVal = Math.max(...values, 1)
  const maxIdx = values.indexOf(Math.max(...values))
  const n = Math.min(labels.length, values.length)
  const brand = String(props.brandColor ?? primary)
  const accentColor = String(props.accentColor ?? accent)

  return (
    <Positioned clip={clip} opacity={exit} embedded={embedded}>
      <div className="w-[280px] text-center">
        {props.title && (
          <div className="text-sm font-extrabold text-white mb-2">{String(props.title)}</div>
        )}
        <div className="flex items-end justify-center gap-2 h-28 border-b border-white/20 pb-0.5 relative">
          {Array.from({ length: n }).map((_, i) => {
            const h = (values[i] / maxVal) * 100 * enter
            const isMax = i === maxIdx
            const barColor = isMax ? accentColor : brand
            return (
              <div key={i} className="flex flex-col items-center w-10 z-[1]">
                <div
                  className="text-[10px] font-bold mb-1"
                  style={{ color: isMax ? accentColor : '#fff' }}
                >
                  {Math.round(values[i] * enter)}{String(props.unit ?? '')}
                </div>
                <div
                  className="rounded-t"
                  style={{
                    width: isMax ? 34 : 28,
                    height: `${Math.max(4, h)}%`,
                    minHeight: 4,
                    background: `linear-gradient(180deg, ${barColor}, ${barColor}88)`,
                    boxShadow: `0 0 12px ${barColor}55`,
                  }}
                />
                <div className="text-[10px] font-semibold text-white/80 mt-1">{labels[i]}</div>
              </div>
            )
          })}
        </div>
      </div>
    </Positioned>
  )
}

function ComparisonChartProPreview({ clip, currentTime, primary, accent, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const labels = asStringList(props.labels, ['Option A', 'Option B'])
  const values = asNumberList(props.values, [65, 35])
  const maxVal = Math.max(...values, 1)
  const n = Math.min(labels.length, values.length)
  const brand = String(props.brandColor ?? primary)
  const accentColor = String(props.accentColor ?? accent)
  const unit = String(props.unit ?? '%')

  return (
    <Positioned clip={clip} opacity={exit} embedded={embedded}>
      <div className="w-[280px] text-left space-y-2">
        {props.title && (
          <div className="text-sm font-extrabold text-white text-center mb-1">{String(props.title)}</div>
        )}
        {Array.from({ length: n }).map((_, i) => {
          const pct = (values[i] / maxVal) * 100 * enter
          const barColor = i === 0 ? accentColor : brand
          return (
            <div key={i}>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="font-bold text-white">{labels[i]}</span>
                <span className="font-black" style={{ color: barColor }}>
                  {Math.round(values[i] * enter)}{unit}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-white/15 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: barColor,
                    boxShadow: `0 0 10px ${barColor}66`,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </Positioned>
  )
}

function HalftoneProPreview({ clip, currentTime }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const color = String(props.color ?? '#FFD600')
  const intensity = Number(props.intensity ?? 0.35)
  const density = Math.max(8, Math.min(24, Number(props.density ?? 14)))
  const seed = Number(props.seed ?? 3)
  const cols = Math.ceil(density)
  const rows = Math.ceil(density * 1.6)
  const cells: Array<{ key: number; left: string; top: string; size: number; opacity: number }> = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      const jitter = seededRandom(seed, idx)
      if (jitter > enter) continue
      cells.push({
        key: idx,
        left: `${(c / cols) * 100}%`,
        top: `${(r / rows) * 100}%`,
        size: 2 + seededRandom(seed, idx + 50) * 5,
        opacity: intensity * (0.4 + jitter * 0.6) * exit,
      })
    }
  }
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {cells.map((d) => (
        <div
          key={d.key}
          className="absolute rounded-full"
          style={{
            left: d.left,
            top: d.top,
            width: d.size,
            height: d.size,
            background: color,
            opacity: d.opacity,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
    </div>
  )
}

function AccentStrokeProPreview({ clip, currentTime, accent, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const brand = String(props.brandColor ?? accent)
  const label = String(props.label ?? props.text ?? '')
  const variant = String(props.variant ?? 'underline')

  return (
    <Positioned clip={clip} opacity={exit} embedded={embedded}>
      <div className="flex flex-col items-center gap-1.5">
        {label && <div className="text-sm font-extrabold text-white">{label}</div>}
        <div
          className="rounded-full"
          style={{
            width: `${enter * (variant === 'slash' ? 80 : 140)}px`,
            height: variant === 'slash' ? 5 : 4,
            background: brand,
            transform: variant === 'slash' ? 'rotate(-12deg)' : undefined,
            boxShadow: `0 0 10px ${brand}88`,
          }}
        />
      </div>
    </Positioned>
  )
}

function LineChartProPreview({ clip, currentTime, primary, accent, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const labels = asStringList(props.labels, ['Q1', 'Q2', 'Q3', 'Q4'])
  const values = asNumberList(props.values, [20, 45, 38, 72])
  const maxVal = Math.max(...values, 1)
  const n = Math.min(labels.length, values.length)
  const brand = String(props.brandColor ?? primary)
  const accentColor = String(props.accentColor ?? accent)
  const w = 260
  const h = 100
  const pad = 12
  const points = Array.from({ length: n }).map((_, i) => {
    const x = pad + (i / Math.max(1, n - 1)) * (w - pad * 2)
    const y = h - pad - (values[i] / maxVal) * (h - pad * 2)
    return `${x},${y}`
  })

  return (
    <Positioned clip={clip} opacity={exit * enter} embedded={embedded}>
      <div className="text-center">
        {props.title && (
          <div className="text-sm font-extrabold text-white mb-1">{String(props.title)}</div>
        )}
        <svg width={w} height={h + 20} viewBox={`0 0 ${w} ${h + 20}`}>
          <polyline
            points={points.join(' ')}
            fill="none"
            stroke={brand}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={600}
            strokeDashoffset={600 * (1 - enter)}
          />
          {points.map((pt, i) => {
            const [x, y] = pt.split(',').map(Number)
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={4 * enter}
                fill={i === n - 1 ? accentColor : brand}
              />
            )
          })}
        </svg>
      </div>
    </Positioned>
  )
}

function MapPinProPreview({ clip, currentTime, primary, accent, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const brand = String(props.brandColor ?? primary)
  const accentColor = String(props.accentColor ?? accent)
  const translateY = (1 - enter) * -40

  return (
    <Positioned
      clip={clip}
      opacity={exit}
      embedded={embedded}
      transform={`translateY(${translateY}px)`}
    >
      <div className="text-center">
        <div
          className="mx-auto w-8 h-8 rounded-full border-4 border-white shadow-lg"
          style={{ background: brand, boxShadow: `0 0 16px ${brand}88` }}
        />
        <div className="w-0 h-0 mx-auto border-l-8 border-r-8 border-t-[14px] border-l-transparent border-r-transparent"
          style={{ borderTopColor: brand }}
        />
        <div className="text-sm font-extrabold text-white mt-1">{String(props.label ?? 'Location')}</div>
        {props.sublabel && (
          <div className="text-xs font-semibold" style={{ color: accentColor }}>
            {String(props.sublabel)}
          </div>
        )}
      </div>
    </Positioned>
  )
}

function BackgroundShaderProPreview({ clip, currentTime }: ProOverlayProps) {
  const { active, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const intensity = Number(props.intensity ?? 0.6)
  return (
    <div
      className="absolute inset-0 pointer-events-none motion-gfx-gradient-shift"
      style={{
        opacity: intensity * exit,
        background: `
          radial-gradient(circle at 30% 40%, ${String(props.colorC ?? '#3B82F6')}88, transparent 45%),
          radial-gradient(circle at 70% 60%, ${String(props.colorB ?? '#1E3A5F')}99, transparent 50%),
          linear-gradient(135deg, ${String(props.colorA ?? '#0F172A')}, ${String(props.colorB ?? '#1E3A5F')})
        `,
      }}
    />
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
    case 'background_shader':
      return <BackgroundShaderProPreview clip={clip} currentTime={currentTime} />
    case 'shape_transition':
      return <ShapeTransitionProPreview clip={clip} currentTime={currentTime} />
    case 'arrow_callout':
      return <ArrowCalloutProPreview clip={clip} currentTime={currentTime} accent={accent} />
    case 'bar_chart':
      return <BarChartProPreview {...common} />
    case 'line_chart':
      return <LineChartProPreview {...common} />
    case 'comparison_chart':
      return <ComparisonChartProPreview {...common} />
    case 'map_pin':
      return <MapPinProPreview {...common} />
    case 'halftone':
      return <HalftoneProPreview clip={clip} currentTime={currentTime} />
    case 'accent_stroke':
      return <AccentStrokeProPreview {...common} />
    case 'device_mockup':
      return <DeviceMockupProPreview {...common} />
    case 'broadcast_lower_third':
    case 'name_plate':
      return <BroadcastL3ProPreview {...common} />
    case 'glass_card':
      return <GlassCardProPreview {...common} />
    case 'voice_waveform':
    case 'eq_visualizer':
      return <WaveformProPreview {...common} />
    case 'circular_waveform':
      return <CircularWaveProPreview {...common} />
    case 'subscribe_badge':
    case 'cta_badge':
      return <SubscribeBadgeProPreview {...common} />
    case 'guest_intro':
      return <GuestIntroProPreview {...common} />
    case 'chapter_marker':
    case 'soundbite':
    case 'data_reveal':
    case 'authority_badge':
    case 'product_highlight':
    case 'feature_callout':
    case 'price_popup':
    case 'icon_pop':
    case 'parallax_slide':
    case 'collage_frame':
    case 'kinetic_line':
    case 'karaoke_caption':
    case 'hud_loader':
      return <TypedCardProPreview {...common} />
    case 'liquid_blob':
      return <LiquidBlobProPreview {...common} />
    case 'doodle_scribble':
    case 'callout_line':
      return <CalloutLineProPreview {...common} />
    case 'pie_chart':
      return <PieChartProPreview {...common} />
    case 'funnel_chart':
      return <FunnelChartProPreview {...common} />
    case 'focus_frame':
      return <FocusFrameProPreview clip={clip} currentTime={currentTime} />
    case 'social_frame':
      return <SocialFrameProPreview clip={clip} currentTime={currentTime} />
    case 'split_screen':
      return <SplitScreenProPreview clip={clip} currentTime={currentTime} primary={primary} accent={accent} />
    case 'grid_layout':
      return <GridLayoutProPreview clip={clip} currentTime={currentTime} />
    case 'glitch_overlay':
      return <GlitchProPreview clip={clip} currentTime={currentTime} />
    case 'paper_rip':
    case 'hud_grid':
      return <FocusFrameProPreview clip={clip} currentTime={currentTime} />
    case 'timeline_flow':
    case 'corporate_timeline':
      return <TimelineFlowProPreview {...common} />
    case 'before_after':
      return <BeforeAfterProPreview {...common} />
    case 'product_reveal':
      return <ProductRevealProPreview {...common} />
    case 'pro_wipe':
    case 'whip_transition':
    case 'zoom_transition':
      return <ShapeTransitionProPreview clip={clip} currentTime={currentTime} />
    case 'texture_bg':
    case 'geometric_pattern':
      return <BackgroundShaderProPreview clip={clip} currentTime={currentTime} />
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

/** Blueprint B — 3D device mockup (editor preview, not a flat chip). */
function DeviceMockupProPreview({ clip, currentTime, primary, accent, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const device = String(props.device ?? 'phone')
  const title = String(props.title ?? 'App')
  const brand = String(props.brandColor ?? primary)
  const textColor = String(props.accentColor ?? accent ?? '#fff')
  const dims =
    device === 'laptop'
      ? { w: 200, h: 128, r: 14, border: 8 }
      : device === 'tablet'
        ? { w: 140, h: 180, r: 20, border: 10 }
        : { w: 100, h: 200, r: 28, border: 10 }
  const rotY = -14 + (1 - enter) * -24
  const scale = 0.72 + enter * 0.28
  const phone = (
    <div
      style={{
        transform: `perspective(1000px) rotateY(${rotY}deg) rotateX(4deg) scale(${scale})`,
        transformStyle: 'preserve-3d',
        opacity: exit,
      }}
    >
      <div
        style={{
          width: dims.w,
          height: dims.h,
          borderRadius: dims.r,
          border: `${dims.border}px solid #27272a`,
          background: '#18181b',
          boxShadow: '0 24px 48px rgba(0,0,0,0.55), inset 0 0 0 1px #3f3f46',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {device !== 'laptop' && (
          <div
            className="absolute left-1/2 -translate-x-1/2 top-2 z-10"
            style={{ width: 36, height: 8, borderRadius: 6, background: '#09090b' }}
          />
        )}
        <div
          className="absolute flex items-center justify-center"
          style={{
            inset: dims.border,
            borderRadius: Math.max(8, dims.r - 8),
            overflow: 'hidden',
            background: `linear-gradient(160deg, ${brand}, ${brand}99 55%, #0f172a)`,
          }}
        >
          <span
            className="font-extrabold text-center px-2"
            style={{ color: textColor, fontSize: 14, fontFamily: fontFamilyFor(title) }}
          >
            {title}
          </span>
        </div>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: dims.r,
            background:
              'radial-gradient(ellipse at 28% 18%, rgba(255,255,255,0.22), transparent 50%)',
          }}
        />
      </div>
      {device === 'laptop' && (
        <div
          className="mx-auto"
          style={{
            width: dims.w + 28,
            height: 10,
            background: 'linear-gradient(180deg, #3f3f46, #27272a)',
            borderRadius: '0 0 8px 8px',
            transform: 'translateX(-14px)',
          }}
        />
      )}
    </div>
  )

  if (embedded) return phone

  const x = clip.effects?.xPct ?? 50
  const y = clip.effects?.yPct ?? 50
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
    >
      {phone}
    </div>
  )
}

/** Broadcast lower third — docked bottom-left bar, not a centered chip. */
function BroadcastL3ProPreview({ clip, currentTime, primary, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const title = String(props.title ?? props.text ?? 'Speaker')
  const subtitle = String(props.subtitle ?? props.label ?? '')
  const brand = String(props.brandColor ?? primary)
  const slide = (1 - enter) * -80

  if (embedded) {
    return (
      <div className="flex" style={{ opacity: enter * exit, transform: `translateX(${slide}px)` }}>
        <div className="w-1.5" style={{ background: brand }} />
        <div>
          <div className="px-3 py-1.5 text-sm font-black text-white" style={{ background: brand }}>
            {title}
          </div>
          {subtitle && (
            <div className="px-3 py-1 text-[11px] font-semibold text-white bg-slate-950/90">
              {subtitle}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="absolute left-0 bottom-[12%] pointer-events-none flex"
      style={{ opacity: enter * exit, transform: `translateX(${slide}px)` }}
    >
      <div className="w-2" style={{ background: brand }} />
      <div>
        <div
          className="px-5 py-2 text-lg font-black text-white"
          style={{ background: brand, fontFamily: fontFamilyFor(title) }}
        >
          {title}
        </div>
        {subtitle && (
          <div className="px-5 py-1.5 text-xs font-semibold text-white bg-slate-950/90">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  )
}

/** Blueprint D — glassmorphism card. */
function GlassCardProPreview({ clip, currentTime, primary, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const title = String(props.title ?? props.text ?? '')
  const subtitle = String(props.subtitle ?? '')
  return (
    <Positioned
      clip={clip}
      opacity={enter * exit}
      embedded={embedded}
      transform={`translateY(${(1 - enter) * 16}px)`}
    >
      <div
        className="min-w-[200px] max-w-xs rounded-2xl px-5 py-4 text-left"
        style={{
          background: 'rgba(15, 23, 42, 0.4)',
          border: '1px solid rgba(255,255,255,0.2)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12)',
        }}
      >
        <div className="text-base font-extrabold text-white" style={{ fontFamily: fontFamilyFor(title) }}>
          {title}
        </div>
        {subtitle && (
          <div className="text-xs font-semibold text-white/80 mt-1">{subtitle}</div>
        )}
      </div>
    </Positioned>
  )
}

/** Blueprint A — bottom-docked pill EQ bars with glow. */
function WaveformProPreview({ clip, currentTime, primary, accent, embedded }: ProOverlayProps) {
  const { active, enter, exit, local } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const brand = String(props.brandColor ?? primary)
  const accentColor = String(props.accentColor ?? accent)
  const bars = Math.min(28, Math.max(12, Number(props.bars ?? 20)))

  const barRow = (
    <div
      className="flex items-end gap-1 h-14"
      style={{ filter: `drop-shadow(0 0 12px ${accentColor}99)` }}
    >
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="w-1.5 rounded-full"
          style={{
            height: `${Math.max(6, Math.abs(Math.sin(local * 8 + i * 0.4)) * 48 * enter)}px`,
            background: `linear-gradient(180deg, ${accentColor}, ${brand})`,
          }}
        />
      ))}
    </div>
  )

  if (embedded) {
    return <div style={{ opacity: enter * exit }}>{barRow}</div>
  }

  return (
    <div
      className="absolute left-1/2 bottom-[6%] -translate-x-1/2 pointer-events-none"
      style={{ opacity: enter * exit }}
    >
      {barRow}
    </div>
  )
}

function CircularWaveProPreview({ clip, currentTime, primary, accent, embedded }: ProOverlayProps) {
  const { active, enter, exit, local } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const brand = String(props.brandColor ?? primary)
  const accentColor = String(props.accentColor ?? accent)
  const spokes = 24
  return (
    <Positioned clip={clip} opacity={enter * exit} embedded={embedded}>
      <svg width={120} height={120} viewBox="0 0 120 120" style={{ filter: `drop-shadow(0 0 12px ${brand}88)` }}>
        {Array.from({ length: spokes }).map((_, i) => {
          const angle = (i / spokes) * Math.PI * 2 - Math.PI / 2
          const len = (8 + Math.abs(Math.sin(local * 6 + i)) * 18) * enter
          const r = 32
          const x1 = 60 + Math.cos(angle) * r
          const y1 = 60 + Math.sin(angle) * r
          const x2 = 60 + Math.cos(angle) * (r + len)
          const y2 = 60 + Math.sin(angle) * (r + len)
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={i % 2 === 0 ? accentColor : brand}
              strokeWidth={3}
              strokeLinecap="round"
            />
          )
        })}
        <circle cx={60} cy={60} r={14} fill={`${brand}33`} stroke={brand} strokeWidth={2} />
      </svg>
    </Positioned>
  )
}

function SubscribeBadgeProPreview({ clip, currentTime, primary, embedded }: ProOverlayProps) {
  const { active, enter, exit, local } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const text = String(props.text ?? 'Subscribe')
  const brand = String(props.brandColor ?? primary)
  const pulse = 1 + 0.04 * Math.sin(local * 5)
  return (
    <Positioned
      clip={clip}
      opacity={exit}
      embedded={embedded}
      transform={`scale(${(0.5 + enter * 0.5) * pulse})`}
    >
      <div
        className="flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-extrabold shadow-lg"
        style={{ background: brand, boxShadow: `0 8px 24px ${brand}88` }}
      >
        <span>▶</span>
        {text}
      </div>
    </Positioned>
  )
}

function GuestIntroProPreview({ clip, currentTime, primary, accent, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const title = String(props.title ?? '')
  const subtitle = String(props.subtitle ?? '')
  const label = String(props.label ?? 'GUEST')
  const brand = String(props.brandColor ?? primary)
  const accentColor = String(props.accentColor ?? accent)
  return (
    <Positioned
      clip={clip}
      opacity={enter * exit}
      embedded={embedded}
      transform={`translateY(${(1 - enter) * 24}px)`}
    >
      <div
        className="text-center px-8 py-5 rounded-2xl min-w-[220px]"
        style={{
          background: 'rgba(15,23,42,0.8)',
          border: `2px solid ${brand}66`,
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="text-[10px] font-extrabold tracking-[0.2em]" style={{ color: accentColor }}>
          {label}
        </div>
        <div className="text-xl font-black text-white mt-1" style={{ fontFamily: fontFamilyFor(title) }}>
          {title}
        </div>
        {subtitle && <div className="text-sm font-semibold text-white/80 mt-1">{subtitle}</div>}
      </div>
    </Positioned>
  )
}

/** Typed cards that still look distinct (not the old left-border chip). */
function TypedCardProPreview({ clip, currentTime, primary, accent, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const vt = (clip.effects?.visualType ?? '').toLowerCase()
  const title = String(props.title ?? props.text ?? props.label ?? getMotionGraphicDef(vt)?.label ?? '')
  const subtitle = String(props.subtitle ?? props.label ?? '')
  const brand = String(props.brandColor ?? primary)
  const accentColor = String(props.accentColor ?? accent)

  if (vt === 'price_popup') {
    return (
      <Positioned clip={clip} opacity={exit} embedded={embedded} transform={`scale(${0.5 + enter * 0.5})`}>
        <div
          className="text-center px-6 py-4 rounded-2xl border-2"
          style={{ background: brand, borderColor: accentColor, boxShadow: `0 12px 32px ${brand}88` }}
        >
          {props.label && (
            <div className="text-[10px] font-extrabold tracking-widest" style={{ color: accentColor }}>
              {String(props.label)}
            </div>
          )}
          <div className="text-2xl font-black text-white">{title}</div>
          {subtitle && <div className="text-xs text-white/90 mt-1">{subtitle}</div>}
        </div>
      </Positioned>
    )
  }

  if (vt === 'karaoke_caption' || vt === 'kinetic_line') {
    const words = title.split(/\s+/).filter(Boolean)
    return (
      <Positioned clip={clip} opacity={exit} embedded={embedded}>
        <div className="flex flex-wrap justify-center gap-1.5">
          {words.map((w, i) => (
            <span
              key={i}
              className="font-black text-white text-lg"
              style={{
                color: i / words.length < enter ? accentColor : '#fff',
                transform: `scale(${i / words.length < enter ? 1.05 : 0.95})`,
                WebkitTextStroke: '2px #000',
                paintOrder: 'stroke fill',
                fontFamily: fontFamilyFor(w),
              }}
            >
              {w}
            </span>
          ))}
        </div>
      </Positioned>
    )
  }

  return (
    <Positioned
      clip={clip}
      opacity={enter * exit}
      embedded={embedded}
      transform={`translateY(${(1 - enter) * 12}px)`}
    >
      <div
        className="px-4 py-3 rounded-2xl text-left min-w-[160px]"
        style={{
          background: 'rgba(15,23,42,0.75)',
          border: `1px solid ${brand}55`,
          boxShadow: `0 8px 24px ${brand}33`,
          backdropFilter: 'blur(10px)',
        }}
      >
        <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: accentColor }}>
          {getMotionGraphicDef(vt)?.label ?? vt}
        </div>
        <div className="text-sm font-extrabold text-white mt-0.5" style={{ fontFamily: fontFamilyFor(title) }}>
          {title}
        </div>
        {subtitle && subtitle !== title && (
          <div className="text-[11px] font-semibold text-white/75 mt-0.5">{subtitle}</div>
        )}
      </div>
    </Positioned>
  )
}

function LiquidBlobProPreview({ clip, currentTime, primary, accent, embedded }: ProOverlayProps) {
  const { active, enter, exit, local } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const a = String(props.colorA ?? primary)
  const b = String(props.colorB ?? accent)
  const morph = Math.sin(local * 2) * 8
  return (
    <Positioned clip={clip} opacity={enter * exit} embedded={embedded}>
      <div
        style={{
          width: 100 + morph,
          height: 90 - morph,
          borderRadius: `${50 + morph}% ${40 - morph}% ${55 + morph}% ${45}%`,
          background: `radial-gradient(circle at 30% 30%, ${a}, ${b})`,
          filter: 'blur(1px)',
          boxShadow: `0 0 32px ${a}66`,
        }}
      />
    </Positioned>
  )
}

function CalloutLineProPreview({ clip, currentTime, accent, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const text = String(props.text ?? '')
  const brand = String(props.brandColor ?? accent)
  const angle = Number(props.angle ?? -25)
  return (
    <Positioned clip={clip} opacity={exit} embedded={embedded} transform={`rotate(${angle}deg)`}>
      <div className="flex items-center gap-2">
        <div
          className="rounded-full"
          style={{
            width: 8 * enter,
            height: 8 * enter,
            background: brand,
            boxShadow: `0 0 10px ${brand}`,
          }}
        />
        <div className="h-0.5 rounded" style={{ width: 80 * enter, background: brand }} />
        {text && (
          <span
            className="text-xs font-bold text-white px-2 py-0.5 rounded-md"
            style={{
              opacity: enter,
              transform: `rotate(${-angle}deg)`,
              background: 'rgba(15,23,42,0.6)',
              border: '1px solid rgba(255,255,255,0.2)',
              backdropFilter: 'blur(8px)',
            }}
          >
            {text}
          </span>
        )}
      </div>
    </Positioned>
  )
}

function PieChartProPreview({ clip, currentTime, primary, accent, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const values = asNumberList(props.values, [40, 35, 25])
  const brand = String(props.brandColor ?? primary)
  const accentColor = String(props.accentColor ?? accent)
  const colors = [brand, accentColor, '#22D3EE']
  const total = values.reduce((a, b) => a + b, 0) || 1
  let acc = 0
  const stops = values.map((v, i) => {
    const start = (acc / total) * 100
    acc += v * enter
    const end = (acc / total) * 100
    return `${colors[i % colors.length]} ${start}% ${end}%`
  })
  return (
    <Positioned clip={clip} opacity={exit} embedded={embedded}>
      <div className="text-center">
        {props.title && <div className="text-xs font-bold text-white mb-2">{String(props.title)}</div>}
        <div
          className="w-24 h-24 rounded-full mx-auto"
          style={{
            background: `conic-gradient(${stops.join(', ')})`,
            boxShadow: `0 0 20px ${brand}44`,
          }}
        />
      </div>
    </Positioned>
  )
}

function FunnelChartProPreview({ clip, currentTime, primary, accent, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const labels = asStringList(props.labels ?? props.steps, ['Awareness', 'Interest', 'Convert'])
  const brand = String(props.brandColor ?? primary)
  const accentColor = String(props.accentColor ?? accent)
  return (
    <Positioned clip={clip} opacity={enter * exit} embedded={embedded}>
      <div className="flex flex-col items-center gap-1 w-40">
        {labels.map((lab, i) => (
          <div
            key={i}
            className="text-[10px] font-bold text-center py-1.5 rounded"
            style={{
              width: `${90 - i * 18}%`,
              background: i === labels.length - 1 ? accentColor : brand,
              color: i === labels.length - 1 ? '#111' : '#fff',
            }}
          >
            {lab}
          </div>
        ))}
      </div>
    </Positioned>
  )
}

function SocialFrameProPreview({ clip, currentTime }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const brand = String(props.brandColor ?? '#fff')
  const label = String(props.label ?? props.platform ?? '9:16')
  return (
    <div className="absolute inset-[4%] pointer-events-none rounded-3xl" style={{ opacity: enter * exit, border: `2px solid ${brand}55` }}>
      <div
        className="absolute top-[4%] left-1/2 -translate-x-1/2 text-[10px] font-extrabold tracking-widest px-3 py-1 rounded-full"
        style={{ color: brand, background: 'rgba(0,0,0,0.45)' }}
      >
        {String(label).toUpperCase()} · 9:16
      </div>
    </div>
  )
}

function SplitScreenProPreview({
  clip,
  currentTime,
  primary,
  accent,
}: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ opacity: enter * exit }}>
      <div className="absolute inset-y-0 left-0 w-1/2" style={{ background: `${primary}22`, borderRight: `2px solid ${accent}` }} />
      <div className="absolute inset-y-0 right-0 w-1/2" style={{ background: `${accent}18` }} />
      <div className="absolute top-[8%] left-1/4 -translate-x-1/2 text-xs font-extrabold text-white">
        {String(props.leftLabel ?? 'A')}
      </div>
      <div className="absolute top-[8%] left-3/4 -translate-x-1/2 text-xs font-extrabold text-white">
        {String(props.rightLabel ?? 'B')}
      </div>
    </div>
  )
}

function GridLayoutProPreview({ clip, currentTime }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const brand = String(props.brandColor ?? '#fff')
  return (
    <div className="absolute inset-[8%] pointer-events-none grid grid-cols-2 grid-rows-2 gap-2" style={{ opacity: enter * exit }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl" style={{ border: `2px solid ${brand}55`, background: `${brand}10` }} />
      ))}
    </div>
  )
}

function GlitchProPreview({ clip, currentTime }: ProOverlayProps) {
  const { active, enter, exit, local } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const brand = String(props.brandColor ?? '#22D3EE')
  const accentColor = String(props.accentColor ?? '#EF4444')
  const j = Math.sin(local * 20) * 6
  return (
    <div className="absolute inset-0 pointer-events-none mix-blend-screen" style={{ opacity: enter * exit * 0.5 }}>
      <div className="absolute inset-0" style={{ background: `${brand}22`, transform: `translateX(${j}px)` }} />
      <div className="absolute inset-0" style={{ background: `${accentColor}18`, transform: `translateX(${-j}px)` }} />
      {[20, 45, 70].map((y, i) => (
        <div
          key={i}
          className="absolute left-0 right-0 h-0.5"
          style={{
            top: `${y}%`,
            background: i % 2 ? brand : accentColor,
            transform: `translateX(${j * (i + 1)}px)`,
          }}
        />
      ))}
    </div>
  )
}

function FocusFrameProPreview({ clip, currentTime }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const brand = String(props.brandColor ?? '#fff')
  const intensity = Number(props.intensity ?? 0.45)
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        opacity: enter * exit,
        boxShadow: `inset 0 0 80px rgba(0,0,0,${intensity})`,
        border: `2px solid ${brand}44`,
      }}
    />
  )
}

function TimelineFlowProPreview({ clip, currentTime, primary, accent, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  const steps = asStringList(props.steps, ['Discover', 'Design', 'Deliver'])
  const brand = String(props.brandColor ?? primary)
  return (
    <Positioned clip={clip} opacity={enter * exit} embedded={embedded}>
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex flex-col items-center w-14">
              <div className="w-4 h-4 rounded-full border-2 border-white" style={{ background: brand }} />
              <div className="text-[9px] font-bold text-white mt-1 text-center">{s}</div>
            </div>
            {i < steps.length - 1 && <div className="w-4 h-0.5 mb-4" style={{ background: brand }} />}
          </div>
        ))}
      </div>
    </Positioned>
  )
}

function BeforeAfterProPreview({ clip, currentTime, primary, accent, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  return (
    <Positioned clip={clip} opacity={exit} embedded={embedded}>
      <div className="w-48 h-20 rounded-lg overflow-hidden relative border border-white/30">
        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white" style={{ background: String(props.brandColor ?? primary) }}>
          {String(props.beforeLabel ?? 'Before')}
        </div>
        <div
          className="absolute inset-y-0 left-0 flex items-center justify-center text-xs font-bold text-white overflow-hidden"
          style={{ width: `${enter * 100}%`, background: String(props.accentColor ?? accent) }}
        >
          {String(props.afterLabel ?? 'After')}
        </div>
      </div>
    </Positioned>
  )
}

function ProductRevealProPreview({ clip, currentTime, primary, accent, embedded }: ProOverlayProps) {
  const { active, enter, exit } = useMotionTiming(clip, currentTime)
  if (!active) return null
  const props = readProps(clip)
  return (
    <Positioned clip={clip} opacity={enter * exit} embedded={embedded} transform={`scale(${0.85 + enter * 0.15})`}>
      <div className="text-center">
        <div className="text-xs font-bold tracking-widest uppercase" style={{ color: String(props.accentColor ?? accent) }}>
          {String(props.title ?? 'Introducing')}
        </div>
        <div className="text-lg font-black text-white mt-1">{String(props.subtitle ?? '')}</div>
      </div>
    </Positioned>
  )
}
