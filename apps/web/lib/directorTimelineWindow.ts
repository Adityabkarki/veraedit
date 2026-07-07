/**
 * Fetch windowed DirectorTimeline slices (Phase 13 + 15).
 */
import { api } from '@/lib/api'

export interface TimelineWindowResponse {
  timelineId: string
  projectId: string
  version: number
  contentType: string
  timeline: Record<string, unknown>
}

export async function fetchDirectorTimelineWindow(
  timelineId: string,
  startFrame: number,
  endFrame: number,
): Promise<{ data: TimelineWindowResponse | null; error: string | null }> {
  const res = await api.get<TimelineWindowResponse>(
    `/timelines/${timelineId}/window?startFrame=${startFrame}&endFrame=${endFrame}`,
  )
  return { data: res.data, error: res.error }
}
