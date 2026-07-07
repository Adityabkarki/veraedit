/**
 * Keeps AI captions in sync with timeline Captions track clips.
 */

import type { Clip } from '@/stores/timelineStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { commitTimelineClips, getFullTimelineClips } from '@/lib/editor/timelineClipUpdates'
import { useCaptionsStore, type Caption } from '@/stores/captionsStore'
import { useUIStore } from '@/stores/uiStore'

export function captionToClip(caption: Caption): Clip {
  const duration = Math.max(0.1, caption.endTime - caption.startTime)
  const preview = caption.text.trim()
  const label =
    preview.length > 0
      ? preview.length > 30
        ? `${preview.slice(0, 30)}…`
        : preview
      : `Caption ${caption.index}`

  return {
    id: caption.id,
    trackId: 'captions',
    startTime: caption.startTime,
    duration,
    label,
    type: 'caption',
    effects: {
      displayValue: caption.text,
      captionIndex: caption.index,
    },
  }
}

export function clipToCaption(clip: Clip, index: number): Caption | null {
  if (clip.trackId !== 'captions' && clip.type !== 'caption') return null
  return {
    id: clip.id,
    index,
    startTime: clip.startTime,
    endTime: clip.startTime + clip.duration,
    text: clip.effects?.displayValue ?? clip.label,
  }
}

/** Replace all caption-track clips from the captions store list. */
export function syncCaptionsToTimeline(
  captions: Caption[],
  options?: { actionLabel?: string; pushHistory?: boolean },
) {
  const s = useTimelineStore.getState()
  const captionClips = captions.map(captionToClip)
  const nextTracks = s.tracks.map((t) =>
    t.id === 'captions' && captions.length > 0
      ? { ...t, visible: true }
      : t,
  )

  commitTimelineClips(
    (clips) => [
      ...clips.filter((c) => c.trackId !== 'captions'),
      ...captionClips,
    ],
    {
      tracks: nextTracks,
      lastEditAction: options?.actionLabel,
      recordUndo: options?.pushHistory,
    },
  )
}

/** Load captions store from saved timeline caption clips. */
export function syncCaptionsFromTimeline(clips: Clip[]): boolean {
  const captionClips = clips
    .filter(
      (c) =>
        (c.trackId === 'captions' || c.type === 'caption') &&
        !c.effects?.animation &&
        !c.effects?.captionAnimation &&
        c.trackId !== 'caption-fx',
    )
    .sort((a, b) => a.startTime - b.startTime)

  if (captionClips.length === 0) return false

  const captions = captionClips.map((c, i) => clipToCaption(c, i + 1)!)
  useCaptionsStore.setState({
    captions,
    editingId: null,
    selectedId: null,
  })
  return true
}

/** After drag/trim on a caption clip — update captions store times. */
export function syncCaptionClipFromTimeline(clipId: string) {
  const clip = getFullTimelineClips().find((c) => c.id === clipId)
  if (!clip || clip.trackId !== 'captions') return

  const startTime = clip.startTime
  const endTime = clip.startTime + clip.duration

  useCaptionsStore.setState((s) => ({
    captions: s.captions.map((c) =>
      c.id === clipId ? { ...c, startTime, endTime } : c,
    ),
  }))
}

/** Remove captions store entries when timeline clips are deleted. */
export function removeCaptionsByClipIds(clipIds: string[]) {
  if (clipIds.length === 0) return
  const idSet = new Set(clipIds)
  useCaptionsStore.setState((s) => {
    const filtered = s.captions
      .filter((c) => !idSet.has(c.id))
      .map((c, i) => ({ ...c, index: i + 1 }))
    return {
      captions: filtered,
      selectedId: s.selectedId && idSet.has(s.selectedId) ? null : s.selectedId,
      editingId: s.editingId && idSet.has(s.editingId) ? null : s.editingId,
    }
  })
}

/** Open caption editor and focus a caption (from timeline clip click). */
export function openCaptionEditor(captionId: string) {
  useUIStore.getState().setRightPanelMode('captions')
  useCaptionsStore.getState().selectCaption(captionId)
  useCaptionsStore.getState().startEdit(captionId)
}

/** Clear caption clips from timeline (on reset). */
export function clearCaptionClipsFromTimeline() {
  commitTimelineClips((clips) => clips.filter((c) => c.trackId !== 'captions'))
}
