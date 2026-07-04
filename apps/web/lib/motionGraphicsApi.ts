/**
 * Motion graphics API client — library, validate, AI suggest, Magic VOX Mode.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export interface MotionPlan {
  version: number
  fps: number
  width: number
  height: number
  durationSeconds?: number
  elements: Array<Record<string, unknown>>
  style?: string
  directorPrompt?: string
  /** Resolved ThemeToken — derived from Brand Kit upstream. */
  theme?: Record<string, unknown>
}

export interface MagicMotionResult {
  plan: MotionPlan
  warnings: string[]
  assets: {
    numbers: Array<Record<string, unknown>>
    quotes: Array<Record<string, unknown>>
    locations?: Array<Record<string, unknown>>
    suggestedCharts: Array<Record<string, unknown>>
    detectedContentType?: string
    hookText?: string
  }
  style: string
  density?: string
  preset?: string | null
  summary?: {
    elementCount: number
    types: string[]
  }
}

export interface MagicPreset {
  id: string
  label: string
  prompt: string
  density: string
  max_elements: number
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') return body.detail
  } catch {
    /* ignore */
  }
  return fallback
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
  if (!res.ok) throw new Error(await readError(res, 'Motion plan validation failed.'))
  return res.json()
}

export async function suggestMotionGraphics(body: {
  transcript_segments: Array<{ text: string; start: number; end: number }>
  video_duration: number
  content_type?: string
  brand_color?: string
  max_elements?: number
  user_prompt?: string
  style?: string
}): Promise<{ plan: MotionPlan; warnings: string[] }> {
  const res = await fetch(`${API_BASE}/api/v1/motion-graphics/suggest`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await readError(res, 'AI motion graphics suggestion failed.'))
  return res.json()
}

/** Magic VOX Mode — AI Director writes a full motion plan from a natural-language prompt. */
export async function magicVoxMotionGraphics(body: {
  prompt?: string
  transcript_segments: Array<{ text: string; start: number; end: number }>
  video_duration: number
  content_type?: string
  brand_color?: string
  brand_kit?: Record<string, string>
  max_elements?: number
  width?: number
  height?: number
  fps?: number
  style?: string
  density?: 'sparse' | 'balanced' | 'rich'
  preset?: string
}): Promise<MagicMotionResult> {
  const res = await fetch(`${API_BASE}/api/v1/motion-graphics/magic`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await readError(res, 'Magic VOX Mode failed. Please try again.'))
  return res.json()
}

export async function fetchMagicPresets(): Promise<{ presets: MagicPreset[] }> {
  const res = await fetch(`${API_BASE}/api/v1/motion-graphics/presets`, {
    credentials: 'include',
  })
  if (!res.ok) {
    return {
      presets: [
        {
          id: 'explainer',
          label: 'VOX Explainer',
          prompt: 'VOX-style explainer with halftone accents, bold titles, and charts',
          density: 'rich',
          max_elements: 14,
        },
        {
          id: 'consultancy',
          label: 'Consultancy',
          prompt: 'Professional consultancy explainer with animated charts',
          density: 'balanced',
          max_elements: 12,
        },
        {
          id: 'podcast',
          label: 'Podcast',
          prompt: 'Podcast highlight reel with lower thirds and quotes',
          density: 'sparse',
          max_elements: 8,
        },
        {
          id: 'product',
          label: 'Product',
          prompt: 'Product launch with kinetic titles and CTA end card',
          density: 'balanced',
          max_elements: 10,
        },
      ],
    }
  }
  return res.json()
}

export async function prepareMotionAssets(body: {
  transcript_segments: Array<{ text: string; start: number; end: number }>
  brand_color?: string
}): Promise<{ assets: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/api/v1/motion-graphics/prepare`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await readError(res, 'Asset preparation failed.'))
  return res.json()
}

export async function motionGraphicsHealth(): Promise<{ remotion_ok: boolean }> {
  const res = await fetch(`${API_BASE}/api/v1/motion-graphics/health`, {
    credentials: 'include',
  })
  if (!res.ok) return { remotion_ok: false }
  return res.json()
}
