'use client'

/**
 * AnimatedCaption — AE-style caption animations on real transcript text.
 */

import type { CSSProperties, ReactNode } from 'react'
import type { CaptionStyle } from '@/stores/captionsStore'
import type { CaptionEffectConfig } from '@/lib/captionEffects'

interface AnimatedCaptionProps {
  text: string
  style: CaptionStyle | null
  effect: CaptionEffectConfig | null
  /** Seconds into the current caption segment */
  captionLocalTime: number
  captionDuration: number
  /** Seconds into the active FX clip */
  fxLocalTime: number
}

const FONT_SIZE: Record<string, string> = {
  small: 'text-sm',
  medium: 'text-base',
  large: 'text-lg md:text-xl',
  xl: 'text-xl md:text-2xl',
}

function displayText(text: string, effect: CaptionEffectConfig | null): string {
  if (effect?.captionCase === 'uppercase') return text.toUpperCase()
  return text
}

function wrapWords(text: string, maxWords: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return [text]
  const lines: string[] = []
  for (let i = 0; i < words.length; i += maxWords) {
    lines.push(words.slice(i, i + maxWords).join(' '))
  }
  return lines
}

function WordByWordWords({
  words,
  progress,
  accent,
}: {
  words: string[]
  progress: number
  accent: string
}) {
  const activeIdx = Math.min(words.length - 1, Math.floor(progress * words.length))
  return (
    <span className="inline-flex flex-wrap justify-center gap-x-1.5 gap-y-0.5">
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="transition-all duration-150"
          style={{
            opacity: i <= activeIdx ? 1 : 0.2,
            transform: i === activeIdx ? 'scale(1.12)' : 'scale(1)',
            color: i === activeIdx ? accent : undefined,
            textShadow: i === activeIdx ? `0 0 12px ${accent}88` : undefined,
          }}
        >
          {word}
        </span>
      ))}
    </span>
  )
}

function ScalePopWords({
  words,
  progress,
  accent,
}: {
  words: string[]
  progress: number
  accent: string
}) {
  const activeIdx = Math.min(words.length - 1, Math.floor(progress * words.length))
  return (
    <span className="inline-flex flex-wrap justify-center gap-x-1 gap-y-0.5">
      {words.map((word, i) => {
        const isActive = i === activeIdx
        const isPast = i < activeIdx
        return (
          <span
            key={`${word}-${i}`}
            className="inline-block transition-transform duration-100"
            style={{
              transform: isActive ? 'scale(1.18)' : isPast ? 'scale(1)' : 'scale(0.92)',
              opacity: isPast || isActive ? 1 : 0.35,
              color: isActive ? accent : undefined,
            }}
          >
            {word}
          </span>
        )
      })}
    </span>
  )
}

function MaskedRevealWords({
  words,
  progress,
  accent,
}: {
  words: string[]
  progress: number
  accent: string
}) {
  const activeIdx = Math.min(words.length - 1, Math.floor(progress * words.length))
  return (
    <span className="relative inline-block">
      <span className="opacity-30">{words.join(' ')}</span>
      <span
        className="absolute inset-0 overflow-hidden whitespace-nowrap"
        style={{ width: `${Math.max(8, progress * 100)}%` }}
      >
        <span style={{ color: accent }}>{words.slice(0, activeIdx + 1).join(' ')}</span>
      </span>
    </span>
  )
}

export function AnimatedCaption({
  text,
  style,
  effect,
  captionLocalTime,
  captionDuration,
  fxLocalTime,
}: AnimatedCaptionProps) {
  const position = effect?.position ?? style?.position ?? 'bottom'
  const bold = effect?.captionCase === 'uppercase' || style?.bold
  const useNepaliFont = style?.useNepaliFont ?? true
  const fontSize = FONT_SIZE[style?.fontSize ?? 'large'] ?? FONT_SIZE.large
  const accent = style?.color === '#FFFF00' ? '#FBBF24' : '#F59E0B'

  const positionClass =
    position === 'center'
      ? 'bottom-1/2 translate-y-1/2'
      : position === 'top'
        ? 'top-8'
        : 'bottom-10'

  const shown = displayText(text, effect)
  const words = shown.split(/\s+/).filter(Boolean)
  const maxWords = effect?.maxWordsPerLine ?? 4
  const lines = wrapWords(shown, maxWords)

  const segProgress =
    captionDuration > 0 ? Math.min(1, captionLocalTime / captionDuration) : 0
  const popActive = fxLocalTime < 0.45
  const animation = effect?.animation ?? 'none'

  const baseBoxClass = `
    inline-block max-w-[90%] px-5 py-2.5 rounded-lg
    backdrop-blur-sm text-center leading-snug
    ${useNepaliFont ? 'font-nepali' : ''}
    ${bold ? 'uppercase font-black tracking-wide' : 'font-bold'}
    ${fontSize}
  `

  const boxStyle: CSSProperties = {
    color: style?.color ?? '#FFFFFF',
    backgroundColor:
      animation === 'masked_reveal'
        ? 'rgba(0,0,0,0.55)'
        : style?.backgroundColor ?? 'rgba(0,0,0,0.72)',
    textShadow: '0 2px 8px rgba(0,0,0,0.85)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
  }

  let inner: ReactNode

  if (animation === 'word-by-word') {
    inner = (
      <div className={baseBoxClass} style={boxStyle}>
        <WordByWordWords words={words} progress={segProgress} accent={accent} />
      </div>
    )
  } else if (animation === 'scale_pop') {
    inner = (
      <div className={baseBoxClass} style={{ ...boxStyle, backgroundColor: 'rgba(0,0,0,0.65)' }}>
        <ScalePopWords words={words} progress={segProgress} accent={accent} />
      </div>
    )
  } else if (animation === 'masked_reveal') {
    inner = (
      <div className={`${baseBoxClass} cap-fx-masked`} style={boxStyle}>
        <MaskedRevealWords words={words} progress={segProgress} accent={accent} />
      </div>
    )
  } else if (animation === 'slide') {
    inner = (
      <div
        className={`${baseBoxClass} cap-fx-slide-in`}
        style={boxStyle}
        key={`slide-${Math.floor(captionLocalTime * 10)}`}
      >
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    )
  } else if (animation === 'pop') {
    inner = (
      <div
        className={`${baseBoxClass} ${popActive ? 'cap-fx-pop-in' : ''}`}
        style={boxStyle}
        key={`pop-${Math.floor(captionLocalTime * 4)}`}
      >
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    )
  } else {
    inner = (
      <div className={baseBoxClass} style={boxStyle}>
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    )
  }

  return (
    <div
      data-testid="caption-overlay"
      className={`absolute left-0 right-0 flex justify-center px-4 pointer-events-none z-10 ${positionClass}`}
      aria-live="polite"
      aria-label="Current caption"
      data-caption-animation={animation}
    >
      {inner}
    </div>
  )
}
