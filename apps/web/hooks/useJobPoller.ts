import { useEffect, useRef, useState } from 'react'
import { getIngestJob, type IngestJobStatus } from '@/lib/ingest'
import type { ApiResult } from '@/lib/api'

interface JobStatusLike {
  id: string
  status: string
  result?: Record<string, unknown> | null
  error?: string | null
}

interface UseJobPollerOptions {
  intervalMs?: number
  enabled?: boolean
  fetchJob?: (jobId: string) => Promise<ApiResult<JobStatusLike>>
}

export function useJobPoller(
  jobId: string | null,
  onDone: (result: NonNullable<JobStatusLike['result']>) => void,
  options: UseJobPollerOptions = {}
) {
  const { intervalMs = 2000, enabled = true, fetchJob = getIngestJob } = options
  const [status, setStatus] = useState<string>('idle')
  const [result, setResult] = useState<JobStatusLike['result']>(null)
  const [error, setError] = useState<string | null>(null)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    if (!jobId || !enabled) return

    setStatus('queued')
    setResult(null)
    setError(null)

    const interval = window.setInterval(async () => {
      const res = await fetchJob(jobId)
      if (res.error || !res.data) {
        setError(res.error ?? 'Could not check job status.')
        window.clearInterval(interval)
        return
      }

      setStatus(res.data.status)
      if (res.data.status === 'done' && res.data.result) {
        setResult(res.data.result)
        onDoneRef.current(res.data.result)
        window.clearInterval(interval)
      } else if (res.data.status === 'failed') {
        setError(res.data.error ?? 'Import failed.')
        window.clearInterval(interval)
      }
    }, intervalMs)

    return () => window.clearInterval(interval)
  }, [jobId, enabled, intervalMs, fetchJob])

  return { status, result, error }
}
