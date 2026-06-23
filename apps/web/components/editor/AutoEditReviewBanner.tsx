'use client'

/**
 * AutoEditReviewBanner — Accept all / Revert after podcast autopilot applies edits.
 */

import { useAutoEditStore } from '@/stores/autoEditStore'
import { acceptPodcastAutopilot, revertPodcastAutopilot } from '@/lib/podcastAutopilot'

export function AutoEditReviewBanner() {
  const pendingReview = useAutoEditStore((s) => s.pendingReview)
  const editCount = useAutoEditStore((s) => s.editCount)

  if (!pendingReview) return null

  return (
    <div
      data-testid="auto-edit-review-banner"
      className="mx-4 mt-2 rounded-lg border border-status-success/40 bg-status-success/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3"
      role="region"
      aria-label="Review auto-edits"
    >
      <div>
        <p className="text-xs font-semibold text-text-primary">
          Podcast auto-edit applied ({editCount} changes)
        </p>
        <p className="text-[10px] text-text-secondary mt-0.5">
          Filler trims, silence cuts, and chapter markers were added. Review the timeline, then accept or revert.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="auto-edit-revert"
          onClick={() => revertPodcastAutopilot()}
          className="px-3 py-1.5 rounded text-xs border border-bg-overlay text-text-secondary hover:text-text-primary"
        >
          Revert all
        </button>
        <button
          type="button"
          data-testid="auto-edit-accept"
          onClick={() => acceptPodcastAutopilot()}
          className="px-3 py-1.5 rounded text-xs bg-accent text-white font-semibold hover:opacity-90"
        >
          Accept all
        </button>
      </div>
    </div>
  )
}
