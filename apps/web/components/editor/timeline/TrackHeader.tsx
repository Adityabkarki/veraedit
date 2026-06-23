'use client'

/**
 * TrackHeader — sticky left column for a single track row.
 * Label on top, compact mute / lock / visibility controls below.
 */

import { useTimelineStore } from '@/stores/timelineStore'
import type { Track } from '@/stores/timelineStore'
import { useCaptionsStore } from '@/stores/captionsStore'
import { useUIStore } from '@/stores/uiStore'

interface TrackHeaderProps {
  track: Track
}

function ControlButton({
  testId,
  pressed,
  label,
  title,
  onClick,
  children,
  activeClass,
}: {
  testId: string
  pressed: boolean
  label: string
  title: string
  onClick: () => void
  children: React.ReactNode
  activeClass: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={title}
      className={[
        'w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center transition-colors flex-shrink-0',
        pressed ? activeClass : 'text-text-disabled hover:text-text-secondary hover:bg-bg-overlay',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function TrackHeader({ track }: TrackHeaderProps) {
  const { toggleMute, toggleLock, toggleVisibility } = useTimelineStore()
  const captionCount = useCaptionsStore((s) =>
    track.id === 'captions' ? s.captions.length : 0,
  )
  const { setRightPanelMode } = useUIStore()

  const label =
    track.id === 'captions' && captionCount > 0
      ? `${track.label} (${captionCount})`
      : track.label

  return (
    <div
      data-testid={`track-header-${track.id}`}
      className="flex h-full bg-bg-surface border-r border-b border-bg-overlay overflow-hidden"
    >
      <div
        className="w-1 flex-shrink-0 self-stretch"
        style={{ background: track.color }}
        aria-hidden="true"
      />

      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5 px-1.5 py-0.5">
        <span
          className={[
            'text-[11px] font-semibold leading-tight truncate',
            track.visible ? 'text-text-primary' : 'text-text-disabled line-through',
          ].join(' ')}
          title={label}
        >
          {label}
        </span>

        <div className="flex items-center gap-0.5">
          {track.id === 'captions' && captionCount > 0 && (
            <ControlButton
              testId="track-edit-captions"
              pressed={false}
              label="Edit captions"
              title="Edit captions"
              onClick={() => setRightPanelMode('captions')}
              activeClass=""
            >
              Aa
            </ControlButton>
          )}

          <ControlButton
            testId={`track-mute-${track.id}`}
            pressed={track.muted}
            label={track.muted ? `Unmute ${track.label}` : `Mute ${track.label}`}
            title={track.muted ? 'Unmute' : 'Mute'}
            onClick={() => toggleMute(track.id)}
            activeClass="bg-status-warning/25 text-status-warning"
          >
            M
          </ControlButton>

          <ControlButton
            testId={`track-lock-${track.id}`}
            pressed={track.locked}
            label={track.locked ? `Unlock ${track.label}` : `Lock ${track.label}`}
            title={track.locked ? 'Unlock' : 'Lock'}
            onClick={() => toggleLock(track.id)}
            activeClass="bg-status-info/25 text-status-info"
          >
            L
          </ControlButton>

          <ControlButton
            testId={`track-visibility-${track.id}`}
            pressed={!track.visible}
            label={track.visible ? `Hide ${track.label}` : `Show ${track.label}`}
            title={track.visible ? 'Hide track' : 'Show track'}
            onClick={() => toggleVisibility(track.id)}
            activeClass="bg-bg-overlay text-text-disabled"
          >
            V
          </ControlButton>
        </div>
      </div>
    </div>
  )
}
