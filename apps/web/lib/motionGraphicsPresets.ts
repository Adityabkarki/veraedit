/**
 * One-tap Magic Mode presets — mirrors backend MAGIC_PRESETS for offline UI.
 */

export type MagicDensity = 'sparse' | 'balanced' | 'rich'

export interface MagicPresetDef {
  id: string
  label: string
  icon: string
  hint: string
  density: MagicDensity
  maxElements: number
  package: string
  /** Featured on the primary one-tap grid */
  featured?: boolean
}

export const MAGIC_PRESETS: MagicPresetDef[] = [
  {
    id: 'auto',
    label: 'Auto',
    icon: '✨',
    hint: 'Picks the best style for your video',
    density: 'balanced',
    maxElements: 12,
    package: 'auto',
    featured: true,
  },
  {
    id: 'podcast',
    label: 'Podcast',
    icon: '◉',
    hint: 'Guests, EQ, lower thirds, subscribe',
    density: 'balanced',
    maxElements: 12,
    package: 'podcast',
    featured: true,
  },
  {
    id: 'interview',
    label: 'Interview',
    icon: '🎙',
    hint: 'Guest intro, name plates, soundbites',
    density: 'sparse',
    maxElements: 8,
    package: 'podcast',
    featured: true,
  },
  {
    id: 'social_reel',
    label: 'Social Reel',
    icon: '📱',
    hint: '9:16 karaoke, scribbles, vertical template',
    density: 'balanced',
    maxElements: 10,
    package: 'social',
    featured: true,
  },
  {
    id: 'social',
    label: 'Social',
    icon: '⚡',
    hint: 'Karaoke + scribbles, snappy spring',
    density: 'balanced',
    maxElements: 8,
    package: 'social',
  },
  {
    id: 'consultancy',
    label: 'Consultancy',
    icon: '▣',
    hint: 'Glass UI, timelines, charts',
    density: 'balanced',
    maxElements: 12,
    package: 'consultancy',
    featured: true,
  },
  {
    id: 'pitch',
    label: 'Pitch Deck',
    icon: '📈',
    hint: 'Stats, funnel, authority, CTA',
    density: 'balanced',
    maxElements: 10,
    package: 'consultancy',
    featured: true,
  },
  {
    id: 'product',
    label: 'Product',
    icon: '◆',
    hint: 'Mockups, features, offers',
    density: 'rich',
    maxElements: 12,
    package: 'product',
    featured: true,
  },
  {
    id: 'launch',
    label: 'Launch',
    icon: '🚀',
    hint: 'Reveal, price pop, confetti',
    density: 'balanced',
    maxElements: 8,
    package: 'product',
    featured: true,
  },
  {
    id: 'demo',
    label: 'App Demo',
    icon: '💻',
    hint: 'Device mockup, callouts, grid',
    density: 'balanced',
    maxElements: 10,
    package: 'product',
  },
  {
    id: 'explainer',
    label: 'VOX Explainer',
    icon: '✦',
    hint: 'Halftone, charts, doodles',
    density: 'rich',
    maxElements: 12,
    package: 'explainer',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    icon: '○',
    hint: 'Clean titles and end card only',
    density: 'sparse',
    maxElements: 5,
    package: 'consultancy',
  },
]

/** Recommend a preset from transcript text (client-side, instant). */
export function recommendMagicPreset(
  segments: Array<{ text: string }>,
): string {
  const text = segments.map((s) => s.text).join(' ').toLowerCase()
  if (!text.trim()) return 'auto'
  if (/\b(launch\w*|product|app|feature|pricing|demo|saas)\b/.test(text)) {
    if (/\b(launch\w*|announce\w*|introducing)\b/.test(text)) return 'launch'
    if (/\b(demo|walkthrough|screen)\b/.test(text)) return 'demo'
    return 'product'
  }
  if (/\b(consult|client|strategy|roi|pitch|investor|market)\b/.test(text)) {
    if (/\b(pitch|investor|raise|funding)\b/.test(text)) return 'pitch'
    return 'consultancy'
  }
  if (/\b(podcast|episode|guest|interview|host)\b/.test(text)) {
    if (/\b(interview|guest)\b/.test(text)) return 'interview'
    return 'podcast'
  }
  if (/\b(reel|tiktok|shorts|instagram|viral)\b/.test(text)) return 'social_reel'
  if (/\b(explain|why|how|history|because)\b/.test(text)) return 'explainer'
  return 'auto'
}
