'use client'

/**
 * PanelTooltip — first-time pulsing hint shown on each editor panel.
 *
 * Renders a pulsing accent dot + a small bubble tooltip.
 * Once the user clicks "Got it", the panel key is added to
 * `tooltipsDismissed` in editorStore and the tooltip never shows again.
 */

import { useEditorStore } from '@/stores/editorStore'

interface PanelTooltipProps {
  /** Unique key for this panel, e.g. "left" | "preview" | "ai" | "timeline" */
  panelKey: string
  title: string
  description: string
  /** Where the bubble appears relative to the dot */
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

export function PanelTooltip({
  panelKey,
  title,
  description,
  placement = 'bottom',
}: PanelTooltipProps) {
  const { tooltipsDismissed, dismissTooltip } = useEditorStore()

  if (tooltipsDismissed[panelKey]) return null

  const bubbleClass: Record<string, string> = {
    top:    'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left:   'right-full mr-2 top-1/2 -translate-y-1/2',
    right:  'left-full ml-2 top-1/2 -translate-y-1/2',
  }

  return (
    <div
      data-testid={`panel-tooltip-${panelKey}`}
      className="absolute z-50 pointer-events-none"
      style={{ top: 12, right: 12 }}
    >
      {/* Pulsing dot */}
      <div className="relative pointer-events-auto">
        <span className="flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-accent" />
        </span>

        {/* Tooltip bubble */}
        <div
          className={[
            'absolute pointer-events-auto w-56 p-3 rounded-lg border border-bg-overlay',
            'bg-bg-elevated shadow-xl text-left animate-fade-in',
            bubbleClass[placement],
          ].join(' ')}
        >
          <p className="text-sm font-semibold text-text-primary mb-1">{title}</p>
          <p className="text-xs text-text-secondary leading-relaxed">{description}</p>
          <button
            onClick={() => dismissTooltip(panelKey)}
            className="mt-2 text-xs font-medium text-accent hover:text-accent-glow transition-colors"
            aria-label={`Dismiss ${title} tooltip`}
          >
            Got it →
          </button>
        </div>
      </div>
    </div>
  )
}
