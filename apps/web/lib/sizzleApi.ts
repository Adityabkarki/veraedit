/**
 * Sizzle reel / highlight trailer API (Phase 05).
 */
import { api } from '@/lib/api'

export interface SizzleJobStatus {
  id: string
  status: 'queued' | 'processing' | 'done' | 'failed'
  result?: {
    step?: string
    key?: string
    url?: string
    fragment_count?: number
    duration?: number
  }
  error?: string
}

export const MOOD_OPTIONS = [
  { id: 'upbeat', label: 'Upbeat & energetic' },
  { id: 'dramatic', label: 'Dramatic & intense' },
  { id: 'calm', label: 'Calm & inspiring' },
  { id: 'corporate', label: 'Professional' },
] as const

export async function startSizzleGeneration(input: {
  projectId: string
  videoKey: string
  targetDuration?: number
  musicMood?: string
  addCaptions?: boolean
}) {
  return api.post<{ job_id: string; status: string }>('/sizzle/generate', {
    project_id: input.projectId,
    video_key: input.videoKey,
    target_duration: input.targetDuration ?? 30,
    music_mood: input.musicMood ?? 'upbeat',
    add_captions: input.addCaptions ?? true,
  })
}

export async function getSizzleJob(jobId: string) {
  return api.get<SizzleJobStatus>(`/sizzle/jobs/${jobId}`)
}
