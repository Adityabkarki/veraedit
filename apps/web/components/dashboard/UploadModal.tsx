'use client'

import { useState, useRef, useCallback } from 'react'
import {
  Upload,
  X,
  FileVideo,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  formatFileSize,
  estimateTimeRemaining,
  type UploadProgress,
} from '@/lib/upload'

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = [
  'video/mp4',
  'video/quicktime',       // .mov
  'video/x-msvideo',       // .avi
  'video/webm',
  'video/x-matroska',      // .mkv
]
const ACCEPTED_EXTENSIONS = 'video/mp4,video/quicktime,video/x-msvideo,video/webm,video/x-matroska'
const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024 // 10 GB

type ModalState = 'idle' | 'dragging' | 'uploading' | 'success' | 'error'

// ── Component ─────────────────────────────────────────────────────────────────

export interface UploadHelpers {
  onProgress: (p: UploadProgress) => void
  signal: AbortSignal
}

interface UploadModalProps {
  open: boolean
  onClose: () => void
  /**
   * Performs the real upload for the selected File. Receives a progress
   * reporter and an AbortSignal (wired to the Cancel button). Should resolve
   * when the upload is confirmed, or throw on failure.
   */
  onUploadComplete: (file: File, helpers: UploadHelpers) => Promise<void>
}

export function UploadModal({ open, onClose, onUploadComplete }: UploadModalProps) {
  const [state, setState] = useState<ModalState>('idle')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(0)
  const [validationError, setValidationError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // ── File validation ─────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setValidationError(
        'Unsupported format. Please upload MP4, MOV, AVI, WebM, or MKV.'
      )
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setValidationError('File is too large. Maximum size is 10 GB.')
      return
    }
    setValidationError(null)
    setSelectedFile(file)
    setState('idle')
  }, [])

  // ── Drag handlers ───────────────────────────────────────────────────────────

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setState('idle')
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setState('dragging')
  }

  const handleDragLeave = () => {
    setState((s) => (s === 'dragging' ? 'idle' : s))
  }

  // ── Upload ──────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!selectedFile) return
    setState('uploading')
    setProgress(0)
    setValidationError(null)
    abortRef.current = new AbortController()

    // Track speed from progress deltas
    let lastLoaded = 0
    let lastTime = Date.now()

    const onProgress = (p: UploadProgress) => {
      setProgress(p.percentage)
      const now = Date.now()
      const dt = (now - lastTime) / 1000
      if (dt > 0.3) {
        setSpeed((p.loaded - lastLoaded) / dt)
        lastLoaded = p.loaded
        lastTime = now
      }
    }

    try {
      await onUploadComplete(selectedFile, {
        onProgress,
        signal: abortRef.current.signal,
      })
      setState('success')
    } catch (err) {
      if (
        abortRef.current?.signal.aborted ||
        (err instanceof DOMException && err.name === 'AbortError')
      ) {
        setState('idle')
        return
      }
      setValidationError(
        err instanceof Error
          ? err.message
          : 'Upload failed. Please check your connection and try again.'
      )
      setState('error')
    }
  }

  const handleCancel = () => {
    abortRef.current?.abort()
    setState('idle')
    setProgress(0)
  }

  // ── Close / reset ───────────────────────────────────────────────────────────

  const handleClose = () => {
    if (state === 'uploading') handleCancel()
    setState('idle')
    setSelectedFile(null)
    setProgress(0)
    setSpeed(0)
    setValidationError(null)
    onClose()
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const bytesRemaining = selectedFile
    ? selectedFile.size * (1 - progress / 100)
    : 0
  const timeLeft = estimateTimeRemaining(bytesRemaining, speed)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onClose={handleClose} className="max-w-lg">
      <div className="p-6">
        <h2 className="text-lg font-display font-semibold text-text-primary mb-5">
          Upload Video
        </h2>

        {/* ── Success state ── */}
        {state === 'success' ? (
          <div className="flex flex-col items-center py-8 text-center">
            <CheckCircle className="w-14 h-14 text-status-success mb-4" />
            <p className="text-text-primary font-medium text-lg">
              Upload complete!
            </p>
            <p className="text-text-secondary text-sm mt-1">
              ViraEdit is now transcribing your video in Nepali...
            </p>
            <Button onClick={handleClose} className="mt-6">
              Done
            </Button>
          </div>
        ) : (
          <>
            {/* ── Drop zone ── */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Drop video file here or click to browse"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => state !== 'uploading' && inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (state !== 'uploading') inputRef.current?.click()
                }
              }}
              className={cn(
                'border-2 border-dashed rounded-xl p-10 text-center transition-colors',
                state === 'uploading'
                  ? 'cursor-not-allowed opacity-60 border-bg-overlay'
                  : 'cursor-pointer',
                state === 'dragging'
                  ? 'border-accent bg-accent/5'
                  : state !== 'uploading'
                  ? 'border-bg-overlay hover:border-accent/50'
                  : ''
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                  // reset so same file can be re-selected
                  e.target.value = ''
                }}
                className="hidden"
                disabled={state === 'uploading'}
              />

              {selectedFile ? (
                <div className="flex items-center gap-3">
                  <FileVideo className="w-8 h-8 text-accent flex-shrink-0" />
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                  {state !== 'uploading' && (
                    <button
                      type="button"
                      aria-label="Remove selected file"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedFile(null)
                        setValidationError(null)
                      }}
                      className="text-text-disabled hover:text-text-secondary transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-text-disabled mx-auto mb-3" />
                  <p className="text-text-primary text-sm font-medium">
                    Drop your video here, or click to browse
                  </p>
                  <p className="text-text-secondary text-xs mt-1">
                    MP4, MOV, AVI, WebM, MKV — up to 10 GB
                  </p>
                </>
              )}
            </div>

            {/* ── Validation error ── */}
            {validationError && (
              <div
                role="alert"
                className="flex items-center gap-2 mt-3 p-3 rounded-lg
                           bg-status-error/10 border border-status-error/30
                           text-status-error text-sm"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {validationError}
              </div>
            )}

            {/* ── Upload progress ── */}
            {state === 'uploading' && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-text-secondary mb-1.5">
                  <span>Uploading... {progress}%</span>
                  <span>{timeLeft}</span>
                </div>
                <Progress value={progress} />
              </div>
            )}

            {/* ── Actions ── */}
            <div className="flex gap-3 mt-6">
              {state === 'uploading' ? (
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  className="flex-1"
                >
                  Cancel
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={handleClose}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUpload}
                    disabled={!selectedFile || !!validationError}
                    className="flex-1 gap-2"
                  >
                    <Upload className="w-4 h-4" aria-hidden />
                    Upload Video
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}
