'use client'

/**
 * MotionGraphicsEditPanel — schema-driven controls for all motion graphic types.
 */

import { useCallback } from 'react'
import { useTimelineStore, type Clip } from '@/stores/timelineStore'
import { useUIStore } from '@/stores/uiStore'
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
import { MotionPropsForm } from '@/components/editor/motion/MotionPropsForm'

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] text-text-disabled">{children}</span>
}

function RangeRow({
  label,
  value,
  min,
  max,
  onChange,
  testId,
  suffix,
}: {
  label: string
  value: number
  min: number
  max: number
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
        step={1}
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

        <section className="p-3 space-y-3 border-b border-bg-overlay">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
            Content &amp; appearance
          </p>
          <MotionPropsForm
            visualType={vt}
            props={props}
            clipDisplayValue={clip.effects?.displayValue}
            clipSecondaryText={clip.effects?.secondaryText}
            clipBrandColor={clip.effects?.brandColor}
            onPatch={patch}
          />
        </section>

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

        <section className="p-3 space-y-3">
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
