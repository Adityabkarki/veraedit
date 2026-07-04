'use client'

/**
 * MotionGraphicsEditPanel — full control for pro motion graphics:
 * text, colors, enter/exit animations, placement, scale, and timing.
 */

import { useCallback } from 'react'
import { useTimelineStore, type Clip } from '@/stores/timelineStore'
import { useUIStore } from '@/stores/uiStore'
import { useVisualLibraryStore } from '@/stores/visualLibraryStore'
import {
  animationOptionsForType,
  buildMotionGraphicPatch,
  formatAnimationLabel,
  motionGraphicIsFullscreen,
  motionGraphicUsesPosition,
  POSITION_PRESETS,
  readMotionProps,
} from '@/lib/motionGraphicEdit'
import { isMotionGraphicProType, motionGraphicProLabel } from '@/lib/motionGraphicsLibrary'
import { isMotionGraphicClip } from '@/lib/motionGraphics'
import { RightPanelHeader } from '@/components/editor/RightPanelHeader'
import { ClipTimingSection } from '@/components/editor/timeline/ClipTimingSection'
import { useDismissClipEditorOnEscape } from '@/hooks/useDismissClipEditorOnEscape'

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] text-text-disabled">{children}</span>
}

function TextInput({
  label,
  value,
  placeholder,
  onChange,
  testId,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (v: string) => void
  testId?: string
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        data-testid={testId}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
      />
    </label>
  )
}

function ColorInput({
  label,
  value,
  onChange,
  testId,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  testId?: string
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-2 mt-0.5 items-center">
        <input
          data-testid={testId}
          type="color"
          value={value.startsWith('#') ? value : '#3B82F6'}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border border-bg-overlay cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs font-mono text-text-primary"
        />
      </div>
    </label>
  )
}

function RangeRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  testId,
  suffix,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  testId?: string
  suffix?: string
}) {
  return (
    <label className="block">
      <FieldLabel>
        {label} {suffix != null ? `(${Math.round(value)}${suffix})` : ''}
      </FieldLabel>
      <input
        data-testid={testId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent mt-1"
      />
    </label>
  )
}

export function MotionGraphicsEditPanel() {
  const clips = useTimelineStore((s) => s.clips)
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)
  const updateOverlayClip = useTimelineStore((s) => s.updateOverlayClip)
  const rightPanelMode = useUIStore((s) => s.rightPanelMode)

  const clip =
    selectedClipIds.length === 1 && rightPanelMode === 'motion-graphic'
      ? clips.find((c) => c.id === selectedClipIds[0] && isMotionGraphicClip(c) && isMotionGraphicProType(c.effects?.visualType ?? ''))
      : undefined

  useDismissClipEditorOnEscape(Boolean(clip))

  const patch = useCallback(
    (p: Parameters<typeof buildMotionGraphicPatch>[1]) => {
      if (!clip) return
      updateOverlayClip(clip.id, buildMotionGraphicPatch(clip, p))
    },
    [clip, updateOverlayClip],
  )

  const patchProp = useCallback(
    (key: string, value: unknown) => {
      if (!clip) return
      patch({ motionProps: { [key]: value } })
    },
    [clip, patch],
  )

  if (!clip) {
    return (
      <div className="flex flex-col h-full min-h-0 bg-bg-surface border-l border-bg-overlay">
        <RightPanelHeader title="Motion graphics" testId="motion-graphic-panel-close" />
        <p className="p-4 text-xs text-text-disabled leading-relaxed">
          Select a motion graphic on the timeline to edit its text, animation, placement, and colors.
          Add one from Effects → Motion tab.
        </p>
      </div>
    )
  }

  const vt = (clip.effects?.visualType ?? '').toLowerCase()
  const props = readMotionProps(clip)
  const anims = animationOptionsForType(vt)
  const isFullscreen = motionGraphicIsFullscreen(vt)

  return (
    <div
      data-testid="motion-graphic-edit-panel"
      className="flex flex-col h-full min-h-0 bg-bg-surface border-l border-bg-overlay overflow-hidden"
    >
      <RightPanelHeader
        title={motionGraphicProLabel(vt)}
        testId="motion-graphic-panel-close"
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <ClipTimingSection clip={clip} />

        {/* ── Content ── */}
        <section className="p-3 space-y-3 border-b border-bg-overlay">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
            Content
          </p>

          {(vt === 'animated_title' || vt === 'kinetic_text' || vt === 'quote_callout' || vt === 'cta_badge' || vt === 'arrow_callout') && (
            <TextInput
              label="Text"
              testId="mg-edit-text"
              value={String(props.text ?? clip.effects?.displayValue ?? '')}
              placeholder="Your text"
              onChange={(v) => patch({ displayValue: v, motionProps: { text: v } })}
            />
          )}

          {(vt === 'lower_third_pro' || vt === 'end_card') && (
            <>
              <TextInput
                label="Title"
                testId="mg-edit-title"
                value={String(props.title ?? clip.effects?.displayValue ?? '')}
                onChange={(v) => patch({ displayValue: v, motionProps: { title: v } })}
              />
              <TextInput
                label={vt === 'end_card' ? 'Subtitle' : 'Subtitle / role'}
                testId="mg-edit-subtitle"
                value={String(props.subtitle ?? clip.effects?.secondaryText ?? '')}
                onChange={(v) => patch({ secondaryText: v, motionProps: { subtitle: v } })}
              />
            </>
          )}

          {vt === 'end_card' && (
            <TextInput
              label="Handle / @username"
              testId="mg-edit-handle"
              value={String(props.handle ?? '')}
              onChange={(v) => patchProp('handle', v)}
            />
          )}

          {vt === 'quote_callout' && (
            <TextInput
              label="Author"
              testId="mg-edit-author"
              value={String(props.author ?? clip.effects?.secondaryText ?? '')}
              onChange={(v) => patch({ secondaryText: v, motionProps: { author: v } })}
            />
          )}

          {vt === 'stat_counter' && (
            <>
              <label className="block">
                <FieldLabel>Value</FieldLabel>
                <input
                  data-testid="mg-edit-value"
                  type="number"
                  value={Number(props.value ?? 1000)}
                  onChange={(e) => patchProp('value', Number(e.target.value))}
                  className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs font-mono text-text-primary"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <TextInput
                  label="Prefix"
                  value={String(props.prefix ?? '')}
                  onChange={(v) => patchProp('prefix', v)}
                />
                <TextInput
                  label="Suffix"
                  value={String(props.suffix ?? '')}
                  onChange={(v) => patchProp('suffix', v)}
                />
              </div>
              <TextInput
                label="Label"
                testId="mg-edit-label"
                value={String(props.label ?? clip.effects?.secondaryText ?? '')}
                onChange={(v) => patch({ secondaryText: v, motionProps: { label: v } })}
              />
            </>
          )}

          {vt === 'progress_timer' && (
            <TextInput
              label="Bar label"
              value={String(props.label ?? clip.effects?.secondaryText ?? '')}
              onChange={(v) => patch({ secondaryText: v, motionProps: { label: v } })}
            />
          )}

          {(vt === 'animated_title' || vt === 'kinetic_text') && (
            <RangeRow
              label="Font size"
              testId="mg-edit-font-size"
              value={Number(props.fontSize ?? 72)}
              min={32}
              max={120}
              onChange={(v) => patchProp('fontSize', v)}
            />
          )}

          {vt === 'lower_third_pro' && (
            <label className="block">
              <FieldLabel>Style variant</FieldLabel>
              <select
                data-testid="mg-edit-variant"
                value={String(props.variant ?? 'slide')}
                onChange={(e) => patchProp('variant', e.target.value)}
                className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
              >
                <option value="slide">Slide bar</option>
                <option value="glass">Glass blur</option>
                <option value="accent_line">Accent line</option>
              </select>
            </label>
          )}

          {vt === 'shape_transition' && (
            <label className="block">
              <FieldLabel>Transition style</FieldLabel>
              <select
                value={String(props.style ?? 'wipe')}
                onChange={(e) => patchProp('style', e.target.value)}
                className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
              >
                <option value="wipe">Wipe</option>
                <option value="circle">Circle</option>
                <option value="split">Split</option>
              </select>
            </label>
          )}

          {vt === 'particle_burst' && (
            <RangeRow
              label="Particle count"
              value={Number(props.particleCount ?? 40)}
              min={10}
              max={80}
              onChange={(v) => patchProp('particleCount', v)}
            />
          )}

          {vt === 'arrow_callout' && (
            <RangeRow
              label="Arrow angle"
              testId="mg-edit-angle"
              value={Number(props.angle ?? 0)}
              min={-180}
              max={180}
              suffix="°"
              onChange={(v) => patchProp('angle', v)}
            />
          )}
        </section>

        {/* ── Animation ── */}
        <section className="p-3 space-y-3 border-b border-bg-overlay">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
            Animation
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <FieldLabel>Enter</FieldLabel>
              <select
                data-testid="mg-edit-enter"
                value={clip.effects?.motionEnter ?? anims.enter[0]}
                onChange={(e) => patch({ motionEnter: e.target.value })}
                className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
              >
                {anims.enter.map((a) => (
                  <option key={a} value={a}>
                    {formatAnimationLabel(a)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <FieldLabel>Exit</FieldLabel>
              <select
                data-testid="mg-edit-exit"
                value={clip.effects?.motionExit ?? anims.exit[0]}
                onChange={(e) => patch({ motionExit: e.target.value })}
                className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
              >
                {anims.exit.map((a) => (
                  <option key={a} value={a}>
                    {formatAnimationLabel(a)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <FieldLabel>Enter duration (s)</FieldLabel>
              <input
                data-testid="mg-edit-enter-dur"
                type="number"
                min={0.1}
                max={2}
                step={0.05}
                value={clip.effects?.motionEnterDuration ?? 0.5}
                onChange={(e) => patch({ motionEnterDuration: Number(e.target.value) })}
                className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs font-mono text-text-primary"
              />
            </label>
            <label className="block">
              <FieldLabel>Exit duration (s)</FieldLabel>
              <input
                data-testid="mg-edit-exit-dur"
                type="number"
                min={0.1}
                max={1.5}
                step={0.05}
                value={clip.effects?.motionExitDuration ?? 0.35}
                onChange={(e) => patch({ motionExitDuration: Number(e.target.value) })}
                className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs font-mono text-text-primary"
              />
            </label>
          </div>
        </section>

        {/* ── Placement ── */}
        <section className="p-3 space-y-3 border-b border-bg-overlay">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
            Placement
          </p>

          {isFullscreen ? (
            <p className="text-[10px] text-text-disabled">
              Full-frame graphic — covers the entire video. Drag timing on the timeline to move when it appears.
            </p>
          ) : (
            <>
              <p className="text-[10px] text-text-disabled">
                Drag on the preview to move · use sliders for fine control
              </p>
              {motionGraphicUsesPosition(vt) && (
                <div className="flex flex-wrap gap-1">
                  {POSITION_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={`mg-preset-${preset.id}`}
                      onClick={() => patch({ xPct: preset.xPct, yPct: preset.yPct })}
                      className="text-[10px] px-2 py-1 rounded-full border border-bg-overlay text-text-secondary hover:border-accent hover:text-accent transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <RangeRow
                  label="Horizontal"
                  testId="mg-edit-x"
                  value={Math.round(clip.effects?.xPct ?? 50)}
                  min={0}
                  max={100}
                  onChange={(v) => patch({ xPct: v })}
                  suffix="%"
                />
                <RangeRow
                  label="Vertical"
                  testId="mg-edit-y"
                  value={Math.round(clip.effects?.yPct ?? 50)}
                  min={0}
                  max={100}
                  onChange={(v) => patch({ yPct: v })}
                  suffix="%"
                />
              </div>
              <label className="block">
                <FieldLabel>Scale</FieldLabel>
                <input
                  data-testid="mg-edit-scale"
                  type="number"
                  min={0.4}
                  max={3}
                  step={0.1}
                  value={clip.effects?.scale ?? 1}
                  onChange={(e) => patch({ scale: Number(e.target.value) })}
                  className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs font-mono text-text-primary"
                />
              </label>
            </>
          )}
        </section>

        {/* ── Colors ── */}
        <section className="p-3 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
            Colors
          </p>

          {(vt === 'animated_title' || vt === 'kinetic_text') && (
            <>
              <ColorInput
                label="Text color"
                testId="mg-edit-color"
                value={String(props.color ?? '#FFFFFF')}
                onChange={(v) => patchProp('color', v)}
              />
              <ColorInput
                label="Accent color"
                testId="mg-edit-accent"
                value={String(props.accentColor ?? '#FFD600')}
                onChange={(v) => patchProp('accentColor', v)}
              />
            </>
          )}

          {(vt === 'cta_badge') && (
            <>
              <ColorInput
                label="Background"
                value={String(props.brandColor ?? '#EF4444')}
                onChange={(v) => patch({ brandColor: v, motionProps: { brandColor: v } })}
              />
              <ColorInput
                label="Text color"
                value={String(props.textColor ?? '#FFFFFF')}
                onChange={(v) => patchProp('textColor', v)}
              />
            </>
          )}

          {(vt === 'background_gradient') && (
            <>
              <ColorInput
                label="Gradient start"
                value={String(props.colorA ?? '#1E3A5F')}
                onChange={(v) => patchProp('colorA', v)}
              />
              <ColorInput
                label="Gradient end"
                value={String(props.colorB ?? '#3B82F6')}
                onChange={(v) => patchProp('colorB', v)}
              />
            </>
          )}

          {(vt === 'shape_transition') && (
            <ColorInput
              label="Transition color"
              value={String(props.color ?? '#000000')}
              onChange={(v) => patchProp('color', v)}
            />
          )}

          {!['animated_title', 'kinetic_text', 'cta_badge', 'background_gradient', 'shape_transition'].includes(vt) && (
            <ColorInput
              label="Brand color"
              testId="mg-edit-brand"
              value={String(props.brandColor ?? clip.effects?.brandColor ?? '#3B82F6')}
              onChange={(v) => patch({ brandColor: v, motionProps: { brandColor: v } })}
            />
          )}
        </section>
      </div>
    </div>
  )
}

export function openMotionGraphicEditor(clipId: string): void {
  const ui = useUIStore.getState()
  ui.setRightPanelMode('motion-graphic')
  if (!ui.aiPanelOpen) useUIStore.setState({ aiPanelOpen: true })
  useTimelineStore.getState().selectClip(clipId)
}
