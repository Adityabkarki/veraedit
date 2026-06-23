'use client'

/**
 * Click-to-upload overlay when the playhead is on an empty B-Roll slot.
 */

import { useRef } from 'react'
import { usePlayerStore } from '@/stores/playerStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { activeBrollClipAt, attachFileToBrollClip, openBrollEditor } from '@/lib/brollMedia'

export function BrollPreviewUpload() {
  const currentTime = usePlayerStore((s) => s.currentTime)
  const clips = useTimelineStore((s) => s.clips)
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const active = activeBrollClipAt(clips, currentTime)
  if (!active || active.effects?.mediaUrl) return null

  const isSelected = selectedClipIds.includes(active.id)

  const onPick = () => {
    openBrollEditor(active.id)
    fileInputRef.current?.click()
  }

  return (
    <>
      <button
        type="button"
        data-testid="broll-preview-upload"
        onClick={onPick}
        className={`absolute inset-0 z-30 flex flex-col items-center justify-center gap-2
                   bg-black/55 border-2 border-dashed transition-colors
                   ${isSelected ? 'border-accent' : 'border-white/25 hover:border-white/50'}`}
      >
        <span className="text-white text-sm font-semibold">Add B-Roll media</span>
        <span className="text-white/70 text-xs">Click to upload image or video</span>
        <span className="text-white/50 text-[10px]">or select the clip below the timeline</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) attachFileToBrollClip(active.id, file)
          e.target.value = ''
        }}
      />
    </>
  )
}
