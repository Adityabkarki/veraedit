'use client'

/**
 * OverlayMediaEditor — upload / URL media for B-Roll (fullscreen) or image overlays.
 */

import { useCallback, useRef, useState } from 'react'
import type { Clip } from '@/stores/timelineStore'
import { formatEffectTime } from '@/components/editor/timeline/EffectRangeOverlay'
import {
  attachFileToBrollClip,
  attachUrlToBrollClip,
  clearBrollMedia,
} from '@/lib/brollMedia'
import {
  attachFileToImageClip,
  attachUrlToImageClip,
  clearImageMedia,
} from '@/lib/imageMedia'

export type OverlayMediaPurpose = 'broll' | 'image'

interface OverlayMediaEditorProps {
  clip: Clip
  purpose: OverlayMediaPurpose
  variant?: 'panel' | 'compact'
}

const COPY: Record<
  OverlayMediaPurpose,
  { title: string; hint: string; urlLabel: string; acceptVideo: boolean }
> = {
  broll: {
    title: 'B-Roll media',
    hint: 'Fullscreen cutaway over your video while this clip plays',
    urlLabel: 'Or paste image / video URL',
    acceptVideo: true,
  },
  image: {
    title: 'Image overlay',
    hint: 'Layer on top of your video — drag in the preview to move, use the corner handle to resize',
    urlLabel: 'Or paste image URL',
    acceptVideo: false,
  },
}

export function OverlayMediaEditor({
  clip,
  purpose,
  variant = 'panel',
}: OverlayMediaEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const copy = COPY[purpose]
  const testPrefix = purpose === 'image' ? 'image' : 'broll'

  const onFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (!file) return
      if (purpose === 'image' && !file.type.startsWith('image/')) {
        setUrlError('Please choose an image file (JPG, PNG, GIF, WebP…).')
        return
      }
      if (purpose === 'broll' && !file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        setUrlError('Please choose an image or video file.')
        return
      }
      setUrlError(null)
      if (purpose === 'image') attachFileToImageClip(clip.id, file)
      else attachFileToBrollClip(clip.id, file)
    },
    [clip.id, purpose],
  )

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiles(e.target.files)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    onFiles(e.dataTransfer.files)
  }

  const onUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const ok =
      purpose === 'image'
        ? attachUrlToImageClip(clip.id, urlInput)
        : attachUrlToBrollClip(clip.id, urlInput)
    if (!ok) {
      setUrlError(
        purpose === 'image'
          ? 'Enter a valid http(s) image URL (JPG, PNG, GIF, WebP…).'
          : 'Enter a valid http(s) image or video URL.',
      )
      return
    }
    setUrlError(null)
    setUrlInput('')
  }

  const hasMedia = Boolean(clip.effects?.mediaUrl)
  const fileName = clip.effects?.mediaFileName

  const dropClass =
    variant === 'panel'
      ? 'rounded-xl border-2 border-dashed p-6 text-center space-y-3 transition-colors'
      : 'rounded-lg border border-dashed p-4 text-center space-y-2 transition-colors'

  return (
    <div
      data-testid={`${testPrefix}-media-editor`}
      className={variant === 'panel' ? 'flex flex-col gap-4 p-3' : 'space-y-3'}
    >
      <div>
        <p className={`font-semibold text-text-primary ${variant === 'panel' ? 'text-sm' : 'text-xs'}`}>
          {copy.title}
        </p>
        <p className="text-[10px] text-text-disabled mt-0.5">
          {formatEffectTime(clip.startTime)} → {formatEffectTime(clip.startTime + clip.duration)} ·{' '}
          {copy.hint}
        </p>
      </div>

      <div
        className={`${dropClass} ${
          dragOver ? 'border-accent bg-accent/5' : 'border-gray-500/50 bg-black/40'
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {!hasMedia ? (
          <>
            <p className="text-xs text-text-secondary">
              {purpose === 'image'
                ? 'Drop an image here, or use the buttons below'
                : 'Drop an image or video here, or use the buttons below'}
            </p>
            <button
              type="button"
              data-testid={`${testPrefix}-upload-btn`}
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-semibold px-4 py-2 rounded-lg bg-white text-black hover:bg-gray-200"
            >
              Upload from computer
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-status-success font-medium">
              {purpose === 'image' ? 'Image attached' : 'Media attached'}
            </p>
            {fileName && (
              <p className="text-[10px] text-text-disabled truncate" title={fileName}>
                {fileName}
              </p>
            )}
            <div className="flex justify-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-text-secondary hover:text-text-primary"
              >
                Replace file
              </button>
              <button
                type="button"
                onClick={() =>
                  purpose === 'image' ? clearImageMedia(clip.id) : clearBrollMedia(clip.id)
                }
                className="text-status-error hover:underline"
                data-testid={`${testPrefix}-clear-media`}
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={onUrlSubmit} className="space-y-1.5">
        <label className="text-[10px] text-text-disabled">{copy.urlLabel}</label>
        <div className="flex gap-2">
          <input
            data-testid={`${testPrefix}-url-input`}
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://…"
            className="flex-1 min-w-0 px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
          />
          <button
            type="submit"
            data-testid={`${testPrefix}-url-submit`}
            className="px-3 py-1.5 rounded text-xs font-medium bg-accent text-white hover:bg-accent/90 shrink-0"
          >
            Add
          </button>
        </div>
        {urlError && <p className="text-[10px] text-status-error">{urlError}</p>}
      </form>

      <input
        ref={fileInputRef}
        type="file"
        accept={purpose === 'image' ? 'image/*' : 'video/*,image/*'}
        onChange={onFileChange}
        className="hidden"
        data-testid={`${testPrefix}-file-input`}
      />
    </div>
  )
}
