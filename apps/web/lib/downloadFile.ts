/**
 * Reliable file downloads — presigned MinIO URLs ignore the HTML `download`
 * attribute cross-origin, so we fetch a blob or stream through the API.
 */

import { API_PREFIX, API_URL } from '@/lib/api'
import { readAuthTokens } from '@/lib/authStorage'

function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(objectUrl)
}

/** Download a file from an authenticated API path (same-origin to the API). */
export async function downloadFromApi(
  apiPath: string,
  filename: string,
): Promise<{ ok: boolean; error: string | null }> {
  if (typeof window === 'undefined') {
    return { ok: false, error: 'Downloads are only available in the browser.' }
  }

  const path = apiPath.startsWith(API_PREFIX)
    ? apiPath
    : `${API_PREFIX}${apiPath.startsWith('/') ? '' : '/'}${apiPath}`

  const { accessToken } = readAuthTokens()
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: 'GET',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
    if (!response.ok) {
      let detail = `Download failed (${response.status}).`
      try {
        const body = (await response.json()) as { detail?: string; message?: string }
        detail = body.message || (typeof body.detail === 'string' ? body.detail : detail)
      } catch {
        // ignore non-JSON body
      }
      return { ok: false, error: detail }
    }
    const blob = await response.blob()
    triggerBlobDownload(blob, filename)
    return { ok: true, error: null }
  } catch {
    return { ok: false, error: 'Could not download the file. Check your connection and try again.' }
  }
}

/** Download a completed render through the authenticated API stream endpoint. */
export async function downloadRenderFile(
  projectId: string,
  renderId: string,
  filename: string,
): Promise<{ ok: boolean; error: string | null }> {
  return downloadFromApi(
    `/projects/${projectId}/renders/${renderId}/file`,
    filename,
  )
}

/**
 * Download from a presigned or public URL.
 * Falls back to opening the URL in a new tab when CORS blocks fetch.
 */
export async function downloadRemoteFile(
  url: string,
  filename: string,
): Promise<{ ok: boolean; error: string | null }> {
  if (typeof window === 'undefined') {
    return { ok: false, error: 'Downloads are only available in the browser.' }
  }
  if (!url) {
    return { ok: false, error: 'Download link is missing.' }
  }

  try {
    const response = await fetch(url, { mode: 'cors' })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const blob = await response.blob()
    triggerBlobDownload(blob, filename)
    return { ok: true, error: null }
  } catch {
    try {
      window.open(url, '_blank', 'noopener,noreferrer')
      return { ok: true, error: null }
    } catch {
      return {
        ok: false,
        error: 'Could not download the file. Try opening the video in a new tab and saving it.',
      }
    }
  }
}

/** @deprecated Use downloadRemoteFile or downloadRenderFile — kept for existing imports. */
export async function triggerDownload(
  url: string,
  filename = 'viraedit-export.mp4',
): Promise<{ ok: boolean; error: string | null }> {
  return downloadRemoteFile(url, filename)
}
