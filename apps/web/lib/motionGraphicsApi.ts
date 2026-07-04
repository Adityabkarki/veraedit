/**
 * Motion graphics API client — library, validate, AI suggest.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export interface MotionPlan {
  version: number
  fps: number
  width: number
  height: number
  durationSeconds?: number
  elements: Array<Record<string, unknown>>
}

export async function fetchMotionGraphicsLibrary(): Promise<{ components: unknown[] }> {
  const res = await fetch(`${API_BASE}/api/v1/motion-graphics/library`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to load motion graphics library.')
  return res.json()
}

export async function validateMotionPlan(
  plan: MotionPlan,
  videoDuration?: number,
): Promise<{ plan: MotionPlan; warnings: string[] }> {
  const res = await fetch(`${API_BASE}/api/v1/motion-graphics/validate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, video_duration: videoDuration }),
  })
  if (!res.ok) throw new Error('Motion plan validation failed.')
  return res.json()
}

export async function suggestMotionGraphics(body: {
  transcript_segments: Array<{ text: string; start: number; end: number }>
  video_duration: number
  content_type?: string
  brand_color?: string
  max_elements?: number
}): Promise<{ plan: MotionPlan; warnings: string[] }> {
  const res = await fetch(`${API_BASE}/api/v1/motion-graphics/suggest`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('AI motion graphics suggestion failed.')
  return res.json()
}

export async function motionGraphicsHealth(): Promise<{ remotion_ok: boolean }> {
  const res = await fetch(`${API_BASE}/api/v1/motion-graphics/health`, {
    credentials: 'include',
  })
  if (!res.ok) return { remotion_ok: false }
  return res.json()
}
