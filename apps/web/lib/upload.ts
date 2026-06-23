/**
 * Upload Utility — real ViraEdit backend flow.
 *
 * The backend uses a single pre-signed PUT (browser-direct to MinIO),
 * not chunked multipart:
 *
 *   1. POST /api/v1/projects/{pid}/assets   { filename, mime_type, file_size }
 *      → { asset_id, upload_url, storage_key, method: "PUT" }
 *   2. Browser PUT the whole file to upload_url (direct to MinIO, no auth)
 *   3. POST /api/v1/projects/{pid}/assets/{aid}/confirm  { file_size }
 *      → asset (status="uploaded") and transcription is queued
 *
 * The `uploadChunks` helper is retained for completeness/tests but the real
 * flow uses `uploadVideoFile`.
 */

import { api } from '@/lib/api'

export const CHUNK_SIZE = 5 * 1024 * 1024 // 5 MB

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
  chunkIndex: number
  totalChunks: number
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void
  signal?: AbortSignal
}

// ── Real backend types ──────────────────────────────────────────────────────

export interface CreateAssetResponse {
  asset_id: string
  upload_url: string
  storage_key: string
  expires_in: number
  method: string
}

export interface AssetRecord {
  id: string
  project_id: string
  name: string
  original_filename: string
  storage_key: string
  file_size: number | null
  duration_seconds: number | null
  media_type: string
  mime_type: string | null
  status: 'uploading' | 'uploaded' | 'transcribing' | 'analyzing' | 'ready' | 'error'
  error_message: string | null
}

export interface UploadResult {
  ok: boolean
  assetId?: string
  asset?: AssetRecord
  error?: string
}

/**
 * Resolve the MIME type for a file. The browser sometimes reports an empty
 * `file.type` (e.g. for some .mov/.mkv files), so fall back to extension.
 * This MUST be used for BOTH the asset creation (which the backend signs into
 * the pre-signed URL) and the PUT request, or the S3 signature won't match.
 */
export function resolveMime(file: File): string {
  return file.type || guessMimeFromName(file.name)
}

// ── Step 1: create the asset record + get the pre-signed PUT URL ─────────────

export async function createAsset(
  projectId: string,
  file: File
): Promise<{ data: CreateAssetResponse | null; error: string | null }> {
  return api.post<CreateAssetResponse>(`/projects/${projectId}/assets`, {
    filename: file.name,
    mime_type: resolveMime(file),
    file_size: file.size,
  })
}

// ── Step 2: PUT the whole file to MinIO with real upload progress ────────────
// fetch() has no upload-progress events, so we use XMLHttpRequest here.

export function putFileToUrl(
  url: string,
  file: File,
  options: UploadOptions = {}
): Promise<boolean> {
  const { onProgress, signal } = options

  return new Promise<boolean>((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    // The pre-signed URL signs Content-Type, so the PUT MUST send exactly the
    // same MIME the backend used (resolveMime) — always, even if file.type is
    // empty. Otherwise MinIO rejects the upload with 403 SignatureDoesNotMatch.
    xhr.setRequestHeader('Content-Type', resolveMime(file))

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress({
          loaded: e.loaded,
          total: e.total,
          percentage: Math.round((e.loaded / e.total) * 100),
          chunkIndex: 1,
          totalChunks: 1,
        })
      }
    }

    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300)
    xhr.onerror = () => resolve(false)
    xhr.onabort = () => resolve(false)

    if (signal) {
      if (signal.aborted) {
        xhr.abort()
        resolve(false)
        return
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }

    xhr.send(file)
  })
}

// ── Step 3: confirm the upload (verifies object, queues transcription) ───────

export async function confirmAsset(
  projectId: string,
  assetId: string,
  fileSize: number
): Promise<{ data: AssetRecord | null; error: string | null }> {
  return api.post<AssetRecord>(
    `/projects/${projectId}/assets/${assetId}/confirm`,
    { file_size: fileSize }
  )
}

// ── High-level orchestrator: create → PUT → confirm ──────────────────────────

export async function uploadVideoFile(
  projectId: string,
  file: File,
  options: UploadOptions = {}
): Promise<UploadResult> {
  // 1. Create the asset + get the pre-signed URL
  const created = await createAsset(projectId, file)
  if (created.error || !created.data) {
    return { ok: false, error: created.error ?? 'Could not start the upload.' }
  }

  const { asset_id, upload_url } = created.data

  // 2. PUT the file to MinIO
  const putOk = await putFileToUrl(upload_url, file, options)
  if (!putOk) {
    return {
      ok: false,
      assetId: asset_id,
      error: options.signal?.aborted
        ? 'Upload cancelled.'
        : 'The upload did not complete. Please try again.',
    }
  }

  // 3. Confirm — this queues transcription on the backend
  const confirmed = await confirmAsset(projectId, asset_id, file.size)
  if (confirmed.error || !confirmed.data) {
    return {
      ok: false,
      assetId: asset_id,
      error: confirmed.error ?? 'Upload finished but could not be confirmed.',
    }
  }

  return { ok: true, assetId: asset_id, asset: confirmed.data }
}

// ── Status polling: wait for transcription / analysis to progress ────────────

export async function getAsset(
  projectId: string,
  assetId: string
): Promise<{ data: AssetRecord | null; error: string | null }> {
  return api.get<AssetRecord>(`/projects/${projectId}/assets/${assetId}`)
}

/**
 * Poll an asset's status until it reaches a terminal state (`ready` or `error`)
 * or the signal aborts. Calls `onStatus` on every change.
 */
export async function pollAssetStatus(
  projectId: string,
  assetId: string,
  onStatus: (asset: AssetRecord) => void,
  options: { intervalMs?: number; signal?: AbortSignal } = {}
): Promise<AssetRecord | null> {
  const { intervalMs = 2500, signal } = options
  let lastStatus = ''

  while (!signal?.aborted) {
    const { data } = await getAsset(projectId, assetId)
    if (data) {
      if (data.status !== lastStatus) {
        lastStatus = data.status
        onStatus(data)
      }
      if (data.status === 'ready' || data.status === 'error') {
        return data
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return null
}

// ── Chunked helper (retained for completeness; real flow uses single PUT) ────

export async function uploadChunks(
  file: File,
  presignedUrls: string[],
  options: UploadOptions = {}
): Promise<boolean> {
  const { onProgress, signal } = options
  const totalChunks = presignedUrls.length
  let loaded = 0

  for (let i = 0; i < totalChunks; i++) {
    if (signal?.aborted) return false

    const start = i * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, file.size)
    const chunk = file.slice(start, end)

    const res = await fetch(presignedUrls[i], { method: 'PUT', body: chunk, signal })
    if (!res.ok) return false

    loaded += chunk.size
    onProgress?.({
      loaded,
      total: file.size,
      percentage: Math.round((loaded / file.size) * 100),
      chunkIndex: i + 1,
      totalChunks,
    })
  }

  return true
}

// ── Formatting helpers ────────────────────────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatSpeed(bytesPerSec: number): string {
  return `${formatFileSize(bytesPerSec)}/s`
}

export function estimateTimeRemaining(
  bytesRemaining: number,
  bytesPerSec: number
): string {
  if (bytesPerSec <= 0) return '—'
  const seconds = Math.round(bytesRemaining / bytesPerSec)
  if (seconds < 60) return `~${seconds}s left`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `~${minutes}m ${secs}s left`
}

function guessMimeFromName(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  const map: Record<string, string> = {
    mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska',
    avi: 'video/x-msvideo', webm: 'video/webm', m4v: 'video/x-m4v',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
  }
  return map[ext] ?? 'application/octet-stream'
}
