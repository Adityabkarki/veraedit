'use client'

/**
 * MotionGraphicsTab — browse pro motion graphics + one-tap Magic Mode.
 *
 * Non-editors: tap a preset → graphics appear on the timeline. No extra steps.
 */

import { useCallback, useMemo, useState } from 'react'
import { useTimelineStore, type Clip } from '@/stores/timelineStore'
import { useVisualLibraryStore } from '@/stores/visualLibraryStore'
import { useTranscriptStore } from '@/stores/transcriptStore'
import {
  MOTION_GRAPHICS_LIBRARY,
  buildMotionGraphicClipEffects,
  isMotionGraphicProType,
  motionPlanToClipPayloads,
  type MotionGraphicComponentDef,
  type MotionPlanLike,
} from '@/lib/motionGraphicsLibrary'
import { magicVoxMotionGraphics } from '@/lib/motionGraphicsApi'
import {
  MAGIC_PRESETS,
  recommendMagicPreset,
  type MagicDensity,
} from '@/lib/motionGraphicsPresets'
import { openMotionGraphicEditor } from '@/components/editor/motion/MotionGraphicsEditPanel'
import { allocateDedicatedTrack, offsetEffectsForLane, OVERLAY_FAMILY } from '@/lib/timelineLayers'

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'podcast', label: 'Podcast' },
  { id: 'consultancy', label: 'Consultancy' },
  { id: 'product', label: 'Product' },
  { id: 'audio', label: 'Audio' },
  { id: 'typography', label: 'Typography' },
  { id: 'lower_thirds', label: 'Lower thirds' },
  { id: 'data', label: 'Data' },
  { id: 'cta', label: 'CTA' },
  { id: 'ui', label: 'UI' },
  { id: 'layouts', label: 'Layouts' },
  { id: 'effects', label: 'Effects' },
  { id: 'transitions', label: 'Transitions' },
  { id: 'callouts', label: 'Callouts' },
  { id: 'social', label: 'Social' },
]

function timelineDuration(clips: Clip[]): number {
  let max = 0
  for (const c of clips) {
    max = Math.max(max, c.startTime + c.duration)
  }
  return Math.max(max, 5)
}

function transcriptSegmentsForDirector(): Array<{ text: string; start: number; end: number }> {
  const segments = useTranscriptStore.getState().segments
  return segments
    .filter((s) => s.words.some((w) => !w.deleted && w.type === 'word'))
    .map((s) => {
      const words = s.words.filter((w) => !w.deleted && w.type !== 'silence')
      const text = words.map((w) => w.text).join(' ').trim()
      return { text, start: s.startTime, end: s.endTime }
    })
    .filter((s) => s.text.length > 0)
}

function isProMotionClip(clip: Clip): boolean {
  const vt = String(clip.effects?.visualType ?? '')
  return clip.type === 'overlay' && isMotionGraphicProType(vt)
}

export function MotionGraphicsTab() {
  const playheadTime = useTimelineStore((s) => s.playheadTime)
  const clips = useTimelineStore((s) => s.clips)
  const tracks = useTimelineStore((s) => s.tracks)
  const brandColor = useVisualLibraryStore((s) => s.brandKit.primaryColor) || '#3B82F6'
  const [category, setCategory] = useState('all')
  const [lastAdded, setLastAdded] = useState<string | null>(null)

  const recommendedId = useMemo(
    () => recommendMagicPreset(transcriptSegmentsForDirector()),
    // Recompute when clips change (proxy for project load / transcript ready)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clips.length],
  )

  const [magicOpen, setMagicOpen] = useState(true)
  const [showMorePresets, setShowMorePresets] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [magicPrompt, setMagicPrompt] = useState('')
  const [magicPreset, setMagicPreset] = useState(recommendedId)
  const [magicDensity, setMagicDensity] = useState<MagicDensity>('balanced')
  const [replaceExisting, setReplaceExisting] = useState(true)
  const [magicLoading, setMagicLoading] = useState(false)
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [magicError, setMagicError] = useState<string | null>(null)
  const [magicStatus, setMagicStatus] = useState<string | null>(null)

  const existingProCount = useMemo(
    () => clips.filter(isProMotionClip).length,
    [clips],
  )

  const featuredPresets = useMemo(
    () => MAGIC_PRESETS.filter((p) => p.featured),
    [],
  )
  const extraPresets = useMemo(
    () => MAGIC_PRESETS.filter((p) => !p.featured),
    [],
  )

  const insertMotionGraphic = useCallback(
    (def: MotionGraphicComponentDef) => {
      const id = `mg-${Date.now().toString(36)}`
      const effects = buildMotionGraphicClipEffects(def.type, brandColor) as Clip['effects']
      const alloc = allocateDedicatedTrack(tracks, clips, OVERLAY_FAMILY)
      const trackId = alloc.trackId
      const laneEffects = offsetEffectsForLane(effects ?? {}, trackId, OVERLAY_FAMILY.prefix)

      const clip: Clip = {
        id,
        trackId,
        startTime: playheadTime,
        duration: def.duration,
        label: def.label,
        type: 'overlay',
        effects: laneEffects as Clip['effects'],
      }

      useTimelineStore.setState({
        tracks: alloc.tracks,
        clips: [...clips, clip],
        selectedClipIds: [id],
        lastEditAction: `Added ${def.label}`,
      })
      openMotionGraphicEditor(id)
      setLastAdded(def.label)
      setTimeout(() => setLastAdded(null), 2000)
    },
    [brandColor, clips, playheadTime, tracks],
  )

  const applyMotionPlan = useCallback(
    (plan: MotionPlanLike, presetLabel: string, summaryTypes?: string[]) => {
      const payloads = motionPlanToClipPayloads(plan, brandColor)
      if (!payloads.length) {
        setMagicError('No graphics were generated. Try another style.')
        return
      }

      let nextTracks = tracks
      let nextClips = replaceExisting ? clips.filter((c) => !isProMotionClip(c)) : [...clips]
      const newIds: string[] = []

      for (const payload of payloads) {
        const alloc = allocateDedicatedTrack(nextTracks, nextClips, OVERLAY_FAMILY)
        nextTracks = alloc.tracks
        const laneEffects = offsetEffectsForLane(
          payload.effects,
          alloc.trackId,
          OVERLAY_FAMILY.prefix,
        )
        const clip: Clip = {
          id: payload.id,
          trackId: alloc.trackId,
          startTime: payload.startTime,
          duration: payload.duration,
          label: payload.label,
          type: 'overlay',
          effects: laneEffects as Clip['effects'],
        }
        nextClips = [...nextClips, clip]
        newIds.push(clip.id)
      }

      const firstStart = Math.min(...payloads.map((p) => p.startTime))
      useTimelineStore.setState({
        tracks: nextTracks,
        clips: nextClips,
        selectedClipIds: [],
        playheadTime: Number.isFinite(firstStart) ? firstStart : 0,
        lastEditAction: `Applied ${presetLabel} style (${payloads.length} graphics)`,
      })

      const typeHint = summaryTypes?.length
        ? ` · ${summaryTypes.slice(0, 3).join(', ')}${summaryTypes.length > 3 ? '…' : ''}`
        : ''
      setMagicStatus(`Done — ${payloads.length} graphics added${typeHint}. Press play to preview.`)
      setLastAdded(`${payloads.length} graphics`)
      setTimeout(() => {
        setLastAdded(null)
        setMagicStatus(null)
      }, 6000)
    },
    [brandColor, clips, replaceExisting, tracks],
  )

  const runMagicVox = useCallback(
    async (presetId: string) => {
      const presetMeta = MAGIC_PRESETS.find((p) => p.id === presetId)
      if (!presetMeta) return

      setMagicPreset(presetId)
      setMagicDensity(presetMeta.density)
      setMagicLoading(true)
      setActivePresetId(presetId)
      setMagicError(null)
      setMagicStatus(`Applying ${presetMeta.label}…`)

      try {
        const duration = timelineDuration(clips)
        const segments = transcriptSegmentsForDirector()
        const result = await magicVoxMotionGraphics({
          prompt: magicPrompt.trim(),
          preset: presetId,
          density: showAdvanced ? magicDensity : presetMeta.density,
          transcript_segments: segments,
          video_duration: duration,
          brand_color: brandColor,
          content_type: presetMeta.package === 'auto' ? 'auto' : presetMeta.package,
          max_elements: presetMeta.maxElements,
          style: 'vox',
        })

        applyMotionPlan(
          result.plan as MotionPlanLike,
          presetMeta.label,
          result.summary?.types,
        )
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Something went wrong. Please try again.'
        setMagicError(message)
        setMagicStatus(null)
      } finally {
        setMagicLoading(false)
        setActivePresetId(null)
      }
    },
    [applyMotionPlan, brandColor, clips, magicDensity, magicPrompt, showAdvanced],
  )

  const filtered = useMemo(
    () =>
      category === 'all'
        ? MOTION_GRAPHICS_LIBRARY
        : MOTION_GRAPHICS_LIBRARY.filter((c) => c.category === category),
    [category],
  )

  const renderPresetButton = (p: (typeof MAGIC_PRESETS)[0]) => {
    const isActive = activePresetId === p.id
    const isRecommended = p.id === recommendedId
    return (
      <button
        key={p.id}
        type="button"
        data-testid={`mg-preset-${p.id}`}
        disabled={magicLoading}
        onClick={() => void runMagicVox(p.id)}
        className={`relative text-left p-2.5 rounded-xl border transition-all ${
          isActive
            ? 'border-violet-400 bg-violet-500/20 ring-1 ring-violet-400/40'
            : magicPreset === p.id
              ? 'border-violet-500/60 bg-violet-500/10'
              : 'border-bg-overlay hover:border-violet-500/40 hover:bg-bg-overlay/40'
        } disabled:opacity-60`}
      >
        {isRecommended && (
          <span className="absolute -top-1.5 right-1.5 text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-violet-500 text-white">
            For you
          </span>
        )}
        <div className="text-base leading-none mb-1">{isActive ? '…' : p.icon}</div>
        <div className="text-[11px] font-semibold text-text-primary">{p.label}</div>
        <div className="text-[9px] text-text-disabled mt-0.5 leading-snug">{p.hint}</div>
      </button>
    )
  }

  return (
    <div data-testid="motion-graphics-tab" className="flex flex-col h-full overflow-hidden">
      <div className="px-3 pt-3 pb-2 flex-shrink-0 space-y-2">
        <div>
          <p className="text-xs font-semibold text-text-primary">Motion graphics</p>
          <p className="text-[10px] text-text-disabled mt-0.5">
            Tap a style — we handle the rest
          </p>
        </div>

        <button
          type="button"
          data-testid="mg-magic-vox-btn"
          onClick={() => {
            setMagicOpen((v) => !v)
            setMagicError(null)
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-500 text-white text-sm font-bold shadow-lg shadow-violet-500/20 hover:from-violet-500 hover:to-blue-400 transition-all"
        >
          <span aria-hidden>✨</span>
          One-tap styles
        </button>

        {magicOpen && (
          <div
            data-testid="mg-magic-panel"
            className="rounded-xl border border-violet-500/30 bg-bg-elevated p-3 space-y-2.5"
          >
            <p className="text-[10px] text-text-secondary leading-relaxed">
              One tap applies a full motion package to your timeline. Preview matches export.
            </p>

            <div className="grid grid-cols-2 gap-1.5">
              {featuredPresets.map(renderPresetButton)}
            </div>

            {showMorePresets && (
              <div className="grid grid-cols-2 gap-1.5">
                {extraPresets.map(renderPresetButton)}
              </div>
            )}

            <button
              type="button"
              data-testid="mg-more-presets"
              onClick={() => setShowMorePresets((v) => !v)}
              className="w-full text-[10px] text-violet-300 hover:text-violet-200 py-1"
            >
              {showMorePresets ? 'Show fewer styles' : 'More styles (demo, explainer, minimal…)'}
            </button>

            <label className="flex items-center gap-2 text-[10px] text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                data-testid="mg-magic-replace"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                disabled={magicLoading}
                className="rounded border-bg-overlay"
              />
              Replace existing graphics
              {existingProCount > 0 && (
                <span className="text-text-disabled">({existingProCount})</span>
              )}
            </label>

            <button
              type="button"
              data-testid="mg-advanced-toggle"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-[10px] text-text-disabled hover:text-text-secondary"
            >
              {showAdvanced ? 'Hide options' : 'Custom prompt & density'}
            </button>

            {showAdvanced && (
              <div className="space-y-2 pt-1 border-t border-bg-overlay">
                <div>
                  <p className="text-[10px] text-text-disabled mb-1">Density</p>
                  <div className="flex gap-1">
                    {(['sparse', 'balanced', 'rich'] as MagicDensity[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        data-testid={`mg-density-${d}`}
                        disabled={magicLoading}
                        onClick={() => setMagicDensity(d)}
                        className={`flex-1 text-[10px] py-1 rounded-full border capitalize ${
                          magicDensity === d
                            ? 'border-violet-500 text-violet-300 bg-violet-500/10'
                            : 'border-bg-overlay text-text-disabled'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  data-testid="mg-magic-prompt"
                  value={magicPrompt}
                  onChange={(e) => setMagicPrompt(e.target.value)}
                  rows={2}
                  disabled={magicLoading}
                  placeholder="Optional: e.g. focus on charts and guest names"
                  className="w-full px-2 py-1.5 rounded-lg bg-bg-overlay border border-bg-overlay text-xs text-text-primary resize-none focus:outline-none focus:border-violet-500/50"
                />
                <button
                  type="button"
                  data-testid="mg-magic-run"
                  onClick={() => void runMagicVox(magicPreset)}
                  disabled={magicLoading}
                  className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                >
                  {magicLoading ? 'Applying…' : 'Apply selected style'}
                </button>
              </div>
            )}

            {magicLoading && (
              <p data-testid="mg-magic-loading" className="text-[10px] text-violet-300 animate-pulse">
                {magicStatus || 'Building your motion package…'}
              </p>
            )}
            {magicError && (
              <p data-testid="mg-magic-error" className="text-[10px] text-status-error">
                {magicError}
              </p>
            )}
            {magicStatus && !magicError && !magicLoading && (
              <p data-testid="mg-magic-status" className="text-[10px] text-status-success">
                {magicStatus}
              </p>
            )}
          </div>
        )}

        {lastAdded && !magicOpen && (
          <p className="text-[10px] text-status-success">✓ Added {lastAdded}</p>
        )}
      </div>

      <div className="px-3 pb-1 flex-shrink-0">
        <p className="text-[10px] font-semibold text-text-disabled uppercase tracking-wider">
          Or add one at a time
        </p>
      </div>

      <div className="flex gap-1 px-3 pb-2 flex-wrap flex-shrink-0">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            data-testid={`mg-category-${cat.id}`}
            onClick={() => setCategory(cat.id)}
            className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
              category === cat.id
                ? 'bg-accent/20 border-accent text-accent'
                : 'border-bg-overlay text-text-disabled hover:text-text-secondary'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 grid grid-cols-2 gap-2 content-start">
        {filtered.map((def) => (
          <button
            key={def.type}
            type="button"
            data-testid={`mg-item-${def.type}`}
            onClick={() => insertMotionGraphic(def)}
            title={def.description}
            className="flex flex-col items-start gap-1 p-3 rounded-xl bg-bg-elevated border-2 border-transparent hover:border-accent transition-colors text-left group"
          >
            <span className="text-xl leading-none">{def.icon}</span>
            <span className="text-xs font-semibold text-text-primary group-hover:text-accent">
              {def.label}
            </span>
            <span className="text-[9px] text-text-disabled line-clamp-2">{def.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
