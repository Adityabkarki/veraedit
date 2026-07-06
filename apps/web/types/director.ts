/**
 * Director Engine timeline types (mirrors remotion-service DirectorTimeline).
 */

export type DirectorContentType = 'podcast' | 'consultancy' | 'social' | 'showcase'

export type TriggerStatus = 'realized' | 'suppressed'

export interface TriggerLogEntry {
  id: string
  type: string
  transcriptStart: number
  transcriptEnd: number
  confidence: number
  status: TriggerStatus
  resultingEntryId?: string
  metadata?: Record<string, unknown>
  confidenceSource?: 'heuristic' | 'ml'
}

export interface MotionGraphicsEntry {
  id: string
  componentId: string
  startFrame: number
  durationInFrames: number
  layerDepth: number
  props: Record<string, unknown>
  triggerId: string
}

export interface DirectorTimeline {
  schemaVersion: number
  projectId: string
  contentType: DirectorContentType
  fps: number
  durationInFrames: number
  width: number
  height: number
  theme: Record<string, unknown>
  tracks: {
    video: unknown[]
    audio: unknown[]
    captions: unknown[]
    broll: unknown[]
    motionGraphics: MotionGraphicsEntry[]
    transitions: unknown[]
    vfx: unknown[]
    sfx: unknown[]
    multicam: unknown[]
  }
  triggers: TriggerLogEntry[]
}

export interface DirectorTimelineResponse {
  timelineId: string | null
  timeline: DirectorTimeline | null
  version: number
  hasManualOverrides: boolean
  contentType: DirectorContentType | null
  compiledAt?: string | null
}

export interface DirectorCompileResponse {
  timelineId: string
  timeline: DirectorTimeline
  version: number
  hasManualOverrides: boolean
  contentType: DirectorContentType
}

export const DIRECTOR_PILLARS: { id: DirectorContentType; label: string; hint: string }[] = [
  { id: 'podcast', label: 'Podcast', hint: 'Speaker cards, equalizers, warm grade' },
  { id: 'consultancy', label: 'Consultancy', hint: 'Metrics, funnels, clean grade' },
  { id: 'social', label: 'Social', hint: 'Kinetic captions, punchy grade, 9:16' },
  { id: 'showcase', label: 'Showcase', hint: 'Device mockups, feature callouts' },
]

export function triggerLabel(type: string): string {
  return type.replace(/_/g, ' ')
}

export function entryForTrigger(
  timeline: DirectorTimeline,
  trigger: TriggerLogEntry,
): MotionGraphicsEntry | undefined {
  if (!trigger.resultingEntryId) return undefined
  return timeline.tracks.motionGraphics.find((e) => e.id === trigger.resultingEntryId)
}
