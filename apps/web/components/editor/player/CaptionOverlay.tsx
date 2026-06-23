'use client'

/**
 * CaptionOverlay — Devanagari captions with optional FX-track animations.
 * Text comes from the Captions track / transcript — never from toolbox labels.
 */

import { useMemo } from 'react'
import { usePlayerStore } from '@/stores/playerStore'
import { useCaptionsStore } from '@/stores/captionsStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { resolveCaptionEffectAt } from '@/lib/captionEffects'
import { AnimatedCaption } from '@/components/editor/player/AnimatedCaption'

export function CaptionOverlay() {
  const currentTime = usePlayerStore((s) => s.currentTime)
  const activeCaptionText = usePlayerStore((s) => s.activeCaptionText)
  const captions = useCaptionsStore((s) => s.captions)
  const globalStyle = useCaptionsStore((s) => s.globalStyle)
  const clips = useTimelineStore((s) => s.clips)

  const activeCaption = useMemo(
    () => captions.find((c) => currentTime >= c.startTime && currentTime < c.endTime),
    [captions, currentTime],
  )

  const text = activeCaption?.text ?? activeCaptionText
  const resolvedFx = useMemo(
    () => resolveCaptionEffectAt(clips, currentTime),
    [clips, currentTime],
  )

  if (!text) return null

  const captionDuration = activeCaption
    ? activeCaption.endTime - activeCaption.startTime
    : 3
  const captionLocalTime = activeCaption
    ? currentTime - activeCaption.startTime
    : 0

  return (
    <AnimatedCaption
      text={text}
      style={globalStyle}
      effect={resolvedFx?.config ?? null}
      captionLocalTime={captionLocalTime}
      captionDuration={captionDuration}
      fxLocalTime={resolvedFx?.localTime ?? 0}
    />
  )
}

/** Demo captions — placeholder Nepali captions used when no real transcript is loaded. */
export const DEMO_CAPTIONS: { startTime: number; endTime: number; text: string }[] = [
  { startTime: 0.5,  endTime: 3.5,  text: 'नमस्ते साथीहरू!' },
  { startTime: 4,    endTime: 7.5,  text: 'आज हामी केही महत्त्वपूर्ण कुरा सिक्नेछौँ।' },
  { startTime: 8,    endTime: 10.5, text: 'यो video ले तपाईंको सोच बदल्नेछ।' },
  { startTime: 12,   endTime: 15,   text: 'पहिले यो प्रश्नको उत्तर दिनुस्।' },
]
