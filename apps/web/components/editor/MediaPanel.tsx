'use client'

/**
 * MediaPanel — left panel "Media" tab.
 *
 * Shows the project's main video asset and a gallery of supplementary
 * media items (images, audio, extra video) that can be dragged into
 * the timeline.
 */

import { useRef, useState, useCallback } from 'react'
import { UploadZone } from '@/components/editor/UploadZone'
import { useJobPoller } from '@/hooks/useJobPoller'
import { loadEditorProject } from '@/lib/editorData'
import { useAssetStore } from '@/stores/assetStore'
import { useMediaStore, type MediaType, type MediaItem } from '@/stores/mediaStore'
import { uploadMediaFile } from '@/lib/uploadMedia'

interface MediaPanelProps {
  projectId?: string
}

function fmtDuration(s: number | null): string {
  if (!s || s <= 0) return '—'
  const m = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  return `${m}:${String(ss).padStart(2, '0')}`
}

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  uploading:    { text: 'Uploading…',    color: 'text-status-warning' },
  uploaded:     { text: 'Queued',        color: 'text-status-warning' },
  transcribing: { text: 'Transcribing…', color: 'text-status-info' },
  analyzing:    { text: 'Analyzing…',    color: 'text-status-info' },
  ready:        { text: 'Ready',         color: 'text-status-success' },
  error:        { text: 'Failed',        color: 'text-status-error' },
}

const TYPE_ICON: Record<MediaType, string> = {
  video: '🎬',
  audio: '🎵',
  image: '🖼',
}

const DRAG_DATA_TYPE = 'application/x-veraedit-media'

function MediaItemCard({
  item,
  onDelete,
}: {
  item: MediaItem
  onDelete: (id: string) => void
}) {
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData(
        DRAG_DATA_TYPE,
        JSON.stringify({
          id: item.id,
          type: item.type,
          url: item.url,
          name: item.name,
        }),
      )
      e.dataTransfer.effectAllowed = 'copy'
    },
    [item],
  )

  return (
    <div
      className="rounded-lg border border-bg-overlay bg-bg-elevated overflow-hidden group hover:border-accent/40 transition-colors cursor-grab active:cursor-grabbing relative"
      draggable
      onDragStart={handleDragStart}
    >
      <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
        {item.type === 'image' ? (
          <img
            src={item.url}
            alt={item.name}
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : item.type === 'video' ? (
          <video
            src={item.url}
            className="w-full h-full object-contain"
            muted
            preload="metadata"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-text-disabled">
            <span className="text-2xl">🎵</span>
            <span className="text-[10px]">Audio</span>
          </div>
        )}
        <span className="absolute top-1 right-1 bg-black/60 rounded px-1.5 py-0.5 text-[10px] leading-tight">
          {TYPE_ICON[item.type]}
        </span>
      </div>
      <div className="p-2">
        <p className="text-[11px] font-medium text-text-primary truncate" title={item.name}>
          {item.name}
        </p>
        {item.fileSize && (
          <p className="text-[10px] text-text-disabled mt-0.5">
            {(item.fileSize / 1024 / 1024).toFixed(1)} MB
          </p>
        )}
      </div>
      <button
        type="button"
        data-testid={`delete-media-${item.id}`}
        onClick={(e) => {
          e.stopPropagation()
          onDelete(item.id)
        }}
        className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white hover:bg-status-error"
        title="Remove"
      >
        ×
      </button>
    </div>
  )
}

export function MediaPanel({ projectId }: MediaPanelProps) {
  const asset = useAssetStore((s) => s.asset)
  const { items: mediaItems, addItem, removeItem } = useMediaStore()
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { status: jobStatus, error: jobError } = useJobPoller(
    activeJobId,
    () => {
      void loadEditorProject(projectId)
      setActiveJobId(null)
    }
  )

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !projectId) return
    setUploading(true)
    setUploadError('')
    const res = await uploadMediaFile(projectId, file)
    if (res.error) {
      setUploadError(res.error)
    }
    setUploading(false)
    e.target.value = ''
  }

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3">
        <p className="text-sm text-text-secondary">Open a project to import media.</p>
      </div>
    )
  }

  const st = asset
    ? STATUS_LABEL[asset.status] ?? { text: asset.status, color: 'text-text-secondary' }
    : null

  return (
    <div className="p-3 space-y-3 overflow-y-auto h-full">
      {/* ── Main video asset ──────────────────────────────────────────────── */}
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
        Main Video
      </p>

      {!asset ? (
        <div className="space-y-2">
          <p className="text-xs text-text-disabled leading-relaxed">
            Paste a social URL or upload a video file to start editing.
          </p>
          <UploadZone projectId={projectId} onJobStarted={setActiveJobId} />
          {activeJobId && (
            <p className="text-xs text-text-secondary" data-testid="ingest-job-status">
              {jobError
                ? jobError
                : jobStatus === 'processing'
                ? 'Processing video…'
                : jobStatus === 'queued'
                ? 'Queued for import…'
                : 'Importing…'}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-bg-overlay bg-bg-elevated overflow-hidden">
          <div className="relative aspect-video bg-black flex items-center justify-center">
            {asset.videoUrl ? (
              <video
                src={asset.videoUrl}
                className="w-full h-full object-contain"
                muted
                preload="metadata"
                aria-label="Asset preview"
              />
            ) : (
              <span className="text-text-disabled text-xs">No preview</span>
            )}
            <span className="absolute bottom-1 right-1 bg-black/70 rounded px-1.5 py-0.5 text-[10px] font-mono text-white">
              {fmtDuration(asset.durationSeconds)}
            </span>
          </div>
          <div className="p-2.5">
            <div className="flex items-center gap-2">
              <span>🎬</span>
              <p className="text-xs font-medium text-text-primary truncate flex-1" title={asset.filename}>
                {asset.filename}
              </p>
            </div>
            <p className={`text-[11px] mt-0.5 ${st?.color}`}>{st?.text}</p>
            {asset.status === 'error' && asset.errorMessage && (
              <p className="text-[10px] mt-1 text-status-error leading-snug line-clamp-4">
                {asset.errorMessage}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Supplementary media ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
          Media Library
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,audio/*,video/*"
          className="hidden"
          onChange={handleFilePick}
          disabled={uploading}
        />
        <button
          type="button"
          data-testid="add-media-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-[11px] px-2 py-0.5 rounded font-medium text-accent hover:bg-accent/10 disabled:opacity-50 transition-colors"
        >
          {uploading ? 'Uploading…' : '+ Add'}
        </button>
      </div>

      {uploadError && (
        <p className="text-xs text-status-error">{uploadError}</p>
      )}

      {mediaItems.length === 0 && (
        <p className="text-[11px] text-text-disabled leading-relaxed px-0.5">
          No additional media yet. Add images, audio, or extra video files.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {mediaItems.map((item) => (
          <MediaItemCard key={item.id} item={item} onDelete={removeItem} />
        ))}
      </div>

      {asset && (
        <p className="text-[10px] text-text-disabled leading-relaxed pt-1">
          Drag clips from the timeline below.
        </p>
      )}
    </div>
  )
}
