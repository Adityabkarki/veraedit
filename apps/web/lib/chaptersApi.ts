/**
 * Chapter extraction API (Phase 04).
 */
import { api } from '@/lib/api'

export interface ChapterClip {
  index: number
  title: string
  summary: string
  start: number
  end: number
  duration: number
  key: string
  url: string
}

export interface ChaptersExtractJobStatus {
  id: string
  status: 'queued' | 'processing' | 'done' | 'failed'
  result?: {
    step?: string
    done?: number
    total?: number
    chapters?: ChapterClip[]
  }
  error?: string
}

export async function startChapterExtraction(input: {
  projectId: string
  videoKey: string
  minChapterDuration?: number
  captionStyle?: string
}) {
  return api.post<{ job_id: string; status: string }>('/chapters/extract', {
    project_id: input.projectId,
    video_key: input.videoKey,
    min_chapter_duration: input.minChapterDuration ?? 60,
    caption_style: input.captionStyle ?? 'minimal',
  })
}

export async function getChapterExtractJob(jobId: string) {
  return api.get<ChaptersExtractJobStatus>(`/chapters/jobs/${jobId}`)
}
