/**
 * Captions API client (Module 03).
 */
import { api } from '@/lib/api'

export type BurnInStyle =
  | 'hormozi'
  | 'mrbeast'
  | 'minimal'
  | 'nepali_bold'
  | 'kinetic'

export interface CaptionJob {
  job_id: string
  status: string
}

export interface CaptionJobStatus {
  id: string
  status: string
  result?: {
    transcript_key?: string
    srt_key?: string
    language?: string
    word_count?: number
    full_text_preview?: string
    words?: Array<{ word: string; start: number; end: number; confidence?: number }>
    segments?: Array<{ text: string; start: number; end: number }>
    language_warning?: string
    output_key?: string
    url?: string
    style?: string
  }
  error?: string
}

export const BURN_IN_STYLES: { id: BurnInStyle; label: string; description: string }[] = [
  { id: 'hormozi', label: 'Hormozi', description: 'Bold white bottom-third — high-energy hooks' },
  { id: 'mrbeast', label: 'MrBeast', description: 'Yellow centred captions — viral shorts style' },
  { id: 'minimal', label: 'Minimal', description: 'Clean white subtitles with soft shadow' },
  { id: 'nepali_bold', label: 'Nepali Bold', description: 'Large Devanagari — Noto Sans on video' },
  { id: 'kinetic', label: 'Kinetic', description: 'Orange-outlined centre captions — punchy motion' },
]

export async function listCaptionStyles() {
  return api.get<{ styles: string[] }>('/captions/styles')
}

export async function startTranscription(
  projectId: string,
  videoKey: string,
  language?: string
) {
  return api.post<CaptionJob>('/captions/transcribe', {
    project_id: projectId,
    video_key: videoKey,
    language,
  })
}

export async function startCaptionRender(
  projectId: string,
  videoKey: string,
  words: Array<{ word: string; start: number; end: number }>,
  style: BurnInStyle
) {
  return api.post<CaptionJob>('/captions/render', {
    project_id: projectId,
    video_key: videoKey,
    words,
    style,
  })
}

export async function getCaptionJob(jobId: string) {
  return api.get<CaptionJobStatus>(`/captions/jobs/${jobId}`)
}

export async function downloadCaptionSrt(jobId: string) {
  const { API_PREFIX } = await import('@/lib/api')
  const { readAuthTokens } = await import('@/lib/authStorage')
  const API_URL =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) ||
    'http://localhost:8000'
  const { accessToken } = readAuthTokens()
  try {
    const res = await fetch(`${API_URL}${API_PREFIX}/captions/jobs/${jobId}/srt`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
    if (!res.ok) {
      return { data: null, error: 'Could not download SRT transcript.' }
    }
    const text = await res.text()
    return { data: text, error: null }
  } catch {
    return { data: null, error: 'Could not reach the server.' }
  }
}
