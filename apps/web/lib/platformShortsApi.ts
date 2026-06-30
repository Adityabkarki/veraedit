/**
 * Platform shorts extraction API (Phase 03).
 */
import { api } from '@/lib/api'

export interface PlatformClip {
  key: string
  url: string
  title: string
  score: number
  duration: number
}

export interface ShortsExtractJobStatus {
  id: string
  status: 'queued' | 'processing' | 'done' | 'failed'
  result?: {
    step?: string
    shorts?: Record<string, PlatformClip[]>
  }
  error?: string
}

export const PLATFORM_OPTIONS = [
  { id: 'tiktok', label: 'TikTok', icon: '🎵' },
  { id: 'instagram_reels', label: 'Instagram', icon: '📸' },
  { id: 'youtube_shorts', label: 'YouTube Shorts', icon: '▶️' },
  { id: 'facebook_reels', label: 'Facebook', icon: '👍' },
] as const

export async function startShortsExtraction(input: {
  projectId: string
  videoKey: string
  platforms: string[]
  maxClips?: number
}) {
  return api.post<{ job_id: string; status: string }>('/shorts/extract', {
    project_id: input.projectId,
    video_key: input.videoKey,
    platforms: input.platforms,
    max_clips: input.maxClips ?? 5,
  })
}

export async function getShortsExtractJob(jobId: string) {
  return api.get<ShortsExtractJobStatus>(`/shorts/jobs/${jobId}`)
}
