/**
 * Text-based editor API (Module 04).
 */
import { api } from '@/lib/api'

export interface TextCut {
  start: number
  end: number
  reason?: string
}

export interface TextWord {
  word: string
  start: number
  end: number
}

export interface CutJob {
  job_id: string
  status: string
}

export interface CutJobStatus {
  id: string
  status: string
  result?: { output_key?: string; url?: string; cut_count?: number }
  error?: string
}

export async function detectFillers(words: TextWord[], language = 'ne') {
  return api.post<{ cuts: TextCut[]; count: number }>('/text-editor/detect-fillers', {
    words,
    language,
  })
}

export async function detectSilences(
  videoKey: string,
  minSilenceDuration = 0.8,
  silenceThresholdDb = -35
) {
  return api.post<{ silences: TextCut[]; count: number }>('/text-editor/detect-silences', {
    video_key: videoKey,
    min_silence_duration: minSilenceDuration,
    silence_threshold_db: silenceThresholdDb,
  })
}

export async function applyCuts(projectId: string, videoKey: string, cuts: TextCut[]) {
  return api.post<CutJob>('/text-editor/apply-cuts', {
    project_id: projectId,
    video_key: videoKey,
    cuts,
  })
}

export async function getCutJob(jobId: string) {
  return api.get<CutJobStatus>(`/text-editor/jobs/${jobId}`)
}
