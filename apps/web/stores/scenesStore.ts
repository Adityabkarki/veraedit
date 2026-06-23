/**
 * Scenes Store — Zustand
 *
 * Manages detected scene segments with editorial metadata.
 * Each scene has:
 *   – time range
 *   – intent type (hook / problem / story / solution / context / cta)
 *   – English summary of what the speaker says/does
 *   – editorial quality score
 *   – placeholder thumbnail colour (real thumbnails in EP-7.2)
 */

import { create } from 'zustand'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SceneIntent = 'hook' | 'problem' | 'story' | 'solution' | 'context' | 'cta'

export interface Scene {
  id:             string
  startTime:      number   // seconds
  endTime:        number   // seconds
  intent:         SceneIntent
  /** One-sentence English summary of this scene's content */
  summary:        string
  /** Editorial quality score 0–100 */
  score:          number
  /** Placeholder colour when no thumbnail_url */
  thumbnailColor: string
  /** MinIO thumbnail URL when generated */
  thumbnailUrl?:  string | null
  title?:         string
  titleReason?:   string
}

// ── Intent metadata ───────────────────────────────────────────────────────────

export const INTENT_META: Record<SceneIntent, { label: string; color: string; emoji: string }> = {
  hook:     { label: 'Hook',     color: '#C41E3A', emoji: '🎣' },
  problem:  { label: 'Problem',  color: '#EF4444', emoji: '⚠' },
  story:    { label: 'Story',    color: '#8B5CF6', emoji: '📖' },
  solution: { label: 'Solution', color: '#22C55E', emoji: '✓' },
  context:  { label: 'Context',  color: '#3B82F6', emoji: 'ℹ' },
  cta:      { label: 'CTA',      color: '#F59E0B', emoji: '📣' },
}

// ── Placeholder data ──────────────────────────────────────────────────────────

export const INITIAL_SCENES: Scene[] = [
  {
    id: 'sc1',
    startTime: 0,   endTime: 72,
    intent: 'hook',
    summary: 'Speaker opens with a direct question to hook the viewer immediately.',
    score: 85,
    thumbnailColor: '#1E3A5F',
  },
  {
    id: 'sc2',
    startTime: 72,  endTime: 270,
    intent: 'problem',
    summary: 'Describes the core problem that most viewers are experiencing.',
    score: 72,
    thumbnailColor: '#3D1515',
  },
  {
    id: 'sc3',
    startTime: 270, endTime: 495,
    intent: 'story',
    summary: 'Personal story with data-backed examples and visual moments.',
    score: 78,
    thumbnailColor: '#1E1040',
  },
  {
    id: 'sc4',
    startTime: 495, endTime: 705,
    intent: 'solution',
    summary: 'Step-by-step solution walkthrough with clear action items.',
    score: 91,
    thumbnailColor: '#0F2E1A',
  },
  {
    id: 'sc5',
    startTime: 705, endTime: 1050,
    intent: 'context',
    summary: 'Supporting examples, Q&A responses, and additional context.',
    score: 64,
    thumbnailColor: '#0D1F38',
  },
  {
    id: 'sc6',
    startTime: 1050, endTime: 1182,
    intent: 'cta',
    summary: 'Strong closing with direct call-to-action and subscribe reminder.',
    score: 88,
    thumbnailColor: '#2D1A00',
  },
]

// ── Backend → store mapping ─────────────────────────────────────────────────

/** A scene as returned by GET /projects/{id}/assets/{id}/scenes. */
export interface ApiScene {
  id:              string
  index:           number
  start_time:      number
  end_time:        number
  title?:          string
  summary?:        string
  is_highlight?:   boolean
  highlight_score?: number
  retention_score?: number
  thumbnail_url?:  string | null
  title_reason?:   string
}

const SCENE_PALETTE = ['#1E3A5F', '#3D1515', '#1E1040', '#0F2E1A', '#0D1F38', '#2D1A00']

/** Normalise a score that may be 0–1 or 0–100 into 0–100. */
function norm100(v: number | undefined, fallback = 70): number {
  if (v == null) return fallback
  return Math.round(v <= 1 ? v * 100 : v)
}

/** Derive a display intent from scene position + highlight flag. */
function deriveIntent(scene: ApiScene, index: number, total: number): SceneIntent {
  if (index === 0) return 'hook'
  if (index === total - 1) return 'cta'
  if (scene.is_highlight) return 'solution'
  return 'context'
}

export function mapApiScene(s: ApiScene, index: number, total: number): Scene {
  return {
    id:             s.id,
    startTime:      s.start_time,
    endTime:        s.end_time,
    intent:         deriveIntent(s, index, total),
    title:          s.title,
    summary:        s.summary || s.title || 'Chapter',
    titleReason:    s.title_reason,
    score:          norm100(s.highlight_score ?? s.retention_score),
    thumbnailColor: SCENE_PALETTE[index % SCENE_PALETTE.length],
    thumbnailUrl:   s.thumbnail_url ?? null,
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export interface ScenesState {
  scenes:          Scene[]
  selectedSceneId: string | null
  loaded:          boolean

  loadFromApi:    (apiScenes: ApiScene[]) => void
  /** Load exported demo fixtures — tests and local previews only. */
  loadDemoData:   () => void
  selectScene:    (id: string | null) => void
  resetScenes:    () => void
}

export const useScenesStore = create<ScenesState>((set) => ({
  scenes:          [],
  selectedSceneId: null,
  loaded:          false,

  loadFromApi: (apiScenes) =>
    set({
      scenes: apiScenes.map((s, i) => mapApiScene(s, i, apiScenes.length)),
      selectedSceneId: null,
      loaded: true,
    }),

  loadDemoData: () =>
    set({
      scenes: INITIAL_SCENES.map((s) => ({ ...s })),
      selectedSceneId: null,
      loaded: false,
    }),

  selectScene:  (id) => set({ selectedSceneId: id }),
  resetScenes:  () => set({ scenes: [], selectedSceneId: null, loaded: false }),
}))
