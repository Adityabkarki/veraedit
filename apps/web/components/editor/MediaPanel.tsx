'use client'

/**
 * MediaPanel — left panel "Media" tab. Shows the project's uploaded asset
 * (the real video) with its filename, duration, and processing status.
 */

import { useAssetStore } from '@/stores/assetStore'

function fmtDuration(s: number | null): string {
  if (!s || s <= 0) return '—'
  const m = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  return `${m}:${String(ss).padStart(2, '0')}`
}

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  uploading:    { text: 'Uploading…',    color: 'text-status-warning' },
  uploaded:     { text: 'Queued',        color: 'text-text-secondary' },
  transcribing: { text: 'Transcribing…', color: 'text-status-info' },
  analyzing:    { text: 'Analyzing…',    color: 'text-status-info' },
  ready:        { text: 'Ready',         color: 'text-status-success' },
  error:        { text: 'Failed',        color: 'text-status-error' },
}

export function MediaPanel() {
  const asset = useAssetStore((s) => s.asset)

  if (!asset) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3">
        <div className="w-10 h-10 rounded-full bg-bg-overlay flex items-center justify-center text-text-disabled">
          🎬
        </div>
        <div>
          <p className="text-sm font-medium text-text-secondary mb-1">No media files</p>
          <p className="text-xs text-text-disabled leading-relaxed">
            Upload a video or drag files here to get started.
          </p>
        </div>
      </div>
    )
  }

  const st = STATUS_LABEL[asset.status] ?? { text: asset.status, color: 'text-text-secondary' }

  return (
    <div data-testid="media-panel" className="p-3 space-y-2 overflow-y-auto h-full">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled mb-1">
        Media
      </p>
      <div
        data-testid="media-asset"
        className="rounded-lg border border-bg-overlay bg-bg-elevated overflow-hidden"
      >
        {/* Thumbnail / video frame */}
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

        {/* Info */}
        <div className="p-2.5">
          <p className="text-xs font-medium text-text-primary truncate" title={asset.filename}>
            {asset.filename}
          </p>
          <p className={`text-[11px] mt-0.5 ${st.color}`}>{st.text}</p>
          {asset.status === 'error' && asset.errorMessage && (
            <p className="text-[10px] mt-1 text-status-error leading-snug line-clamp-4">
              {asset.errorMessage}
            </p>
          )}
        </div>
      </div>

      <p className="text-[10px] text-text-disabled leading-relaxed px-0.5">
        Drag clips from the timeline below. The full video is on the timeline as one clip.
      </p>
    </div>
  )
}
