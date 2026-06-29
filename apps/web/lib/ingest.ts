/**
 * Video ingestion API — URL import and direct upload with job polling.
 */
import { api } from '@/lib/api'

export interface IngestJobResponse {
  job_id: string
  status: string
}

export interface IngestJobStatus {
  id: string
  status: 'queued' | 'processing' | 'done' | 'failed'
  result?: {
    asset_id: string
    video_key: string
    thumb_key: string
    meta: {
      duration: number
      width: number
      height: number
      fps: number
      codec: string
      file_size: number
      has_audio: boolean
    }
  }
  error?: string
}

export async function ingestUrl(projectId: string, url: string) {
  return api.post<IngestJobResponse>('/ingest/url', {
    url,
    project_id: projectId,
  })
}

export async function ingestUpload(projectId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  form.append('project_id', projectId)
  return api.postForm<IngestJobResponse>('/ingest/upload', form)
}

export async function getIngestJob(jobId: string) {
  return api.get<IngestJobStatus>(`/ingest/jobs/${jobId}`)
}
