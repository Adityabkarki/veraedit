'use client'

import { useCallback, useRef, useState } from 'react'
import { ingestUpload, ingestUrl } from '@/lib/ingest'
import { cn } from '@/lib/utils'

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024

interface UploadZoneProps {
  projectId: string
  onJobStarted: (jobId: string) => void
  className?: string
}

export function UploadZone({ projectId, onJobStarted, className }: UploadZoneProps) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleUrlImport = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setLoading(true)
    setError('')
    const res = await ingestUrl(projectId, trimmed)
    if (res.error || !res.data) {
      setError(res.error ?? 'Could not start URL import.')
      setLoading(false)
      return
    }
    onJobStarted(res.data.job_id)
    setUrl('')
    setLoading(false)
  }

  const uploadFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        setError('File is too large. Maximum size is 2 GB.')
        return
      }
      setLoading(true)
      setError('')
      const res = await ingestUpload(projectId, file)
      if (res.error || !res.data) {
        setError(res.error ?? 'Upload failed.')
        setLoading(false)
        return
      }
      onJobStarted(res.data.job_id)
      setLoading(false)
    },
    [projectId, onJobStarted]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragActive(false)
      const file = e.dataTransfer.files[0]
      if (file) void uploadFile(file)
    },
    [uploadFile]
  )

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex gap-2">
        <input
          className="flex-1 border border-bg-overlay rounded-lg px-3 py-2 text-sm
                     bg-bg-elevated text-text-primary placeholder:text-text-disabled"
          placeholder="Paste Instagram, TikTok, or YouTube URL..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleUrlImport()}
          disabled={loading}
          aria-label="Video URL"
        />
        <button
          type="button"
          onClick={() => void handleUrlImport()}
          disabled={loading || !url.trim()}
          className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Import
        </button>
      </div>

      <div
        role="button"
        tabIndex={0}
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onClick={() => !loading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (!loading) inputRef.current?.click()
          }
        }}
        className={cn(
          'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
          dragActive
            ? 'border-accent bg-accent/5'
            : 'border-bg-overlay hover:border-accent/40'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*,audio/*,image/*"
          className="hidden"
          disabled={loading}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void uploadFile(file)
            e.target.value = ''
          }}
        />
        <p className="text-text-secondary text-sm">
          {dragActive ? 'Drop media here...' : 'Drag & drop media, or click to select'}
        </p>
        <p className="text-xs text-text-disabled mt-1">Video, audio, or image up to 2 GB</p>
      </div>

      {error && (
        <p className="text-xs text-status-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
