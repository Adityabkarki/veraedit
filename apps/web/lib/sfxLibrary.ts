/**
 * Built-in SFX library — real Mixkit MP3s from /sfx/*.mp3 (not Web Audio noise).
 */

import { api } from '@/lib/api'

export interface SfxCatalogItem {
  slug: string
  name: string
  category: string
  file_name: string
  duration_ms: number
  preview_url: string
  tags: string[]
  tool_ids: string[]
  license?: string
}

export interface SfxCatalogResponse {
  count: number
  license: string
  items: SfxCatalogItem[]
}

const audioCache = new Map<string, HTMLAudioElement>()
let catalogPromise: Promise<SfxCatalogResponse> | null = null
let slugByType = new Map<string, string>()

/** Legacy sfx_type / tool id → catalog slug. */
const TYPE_ALIASES: Record<string, string> = {
  whoosh: 'whoosh',
  swish: 'whoosh_arrow',
  click: 'shutter_click',
  shutter_click: 'shutter_click',
  sub_bass: 'sub_bass',
  sub_bass_thud: 'sub_bass',
  sfx_on_cut: 'whoosh',
  sfx_whoosh_cut: 'whoosh',
  sfx_sub_bass_thud: 'sub_bass',
  sfx_shutter_click: 'shutter_click',
  sfx_impact_hit: 'impact_hit',
  sfx_pop: 'pop',
  sfx_swipe: 'swipe',
  sfx_glitch: 'glitch',
  sfx_riser: 'riser',
  sfx_notification: 'notification',
}

export function sfxPublicUrl(slug: string): string {
  return `/sfx/${slug}.mp3`
}

export function resolveSfxSlug(sfxType: string, toolId?: string): string {
  const t = sfxType.toLowerCase().trim()
  if (toolId && slugByType.has(toolId)) return slugByType.get(toolId)!
  if (toolId && TYPE_ALIASES[toolId]) return TYPE_ALIASES[toolId]
  if (slugByType.has(t)) return slugByType.get(t)!
  if (TYPE_ALIASES[t]) return TYPE_ALIASES[t]

  if (/^[a-z0-9_]+$/.test(t) && !t.startsWith('sfx_')) {
    return t
  }
  return 'whoosh'
}

function indexCatalog(items: SfxCatalogItem[]) {
  slugByType = new Map()
  for (const item of items) {
    slugByType.set(item.slug, item.slug)
    for (const tid of item.tool_ids ?? []) {
      slugByType.set(tid, item.slug)
    }
  }
}

export async function fetchSfxCatalog(): Promise<SfxCatalogResponse> {
  if (!catalogPromise) {
    catalogPromise = api
      .get<SfxCatalogResponse>('/sfx/library')
      .then((res) => {
        const data = res.data ?? { count: 0, license: '', items: [] }
        indexCatalog(data.items ?? [])
        return data
      })
      .catch(() => {
        const fallback: SfxCatalogResponse = {
          count: 6,
          license: 'Mixkit',
          items: [
            { slug: 'whoosh', name: 'Fast whoosh', category: 'whoosh', file_name: 'whoosh.mp3', duration_ms: 350, preview_url: '/sfx/whoosh.mp3', tags: [], tool_ids: ['sfx_on_cut', 'sfx_whoosh_cut'] },
            { slug: 'shutter_click', name: 'Camera shutter', category: 'camera', file_name: 'shutter_click.mp3', duration_ms: 150, preview_url: '/sfx/shutter_click.mp3', tags: [], tool_ids: ['sfx_shutter_click'] },
            { slug: 'sub_bass', name: 'Sub-bass hit', category: 'impact', file_name: 'sub_bass.mp3', duration_ms: 320, preview_url: '/sfx/sub_bass.mp3', tags: [], tool_ids: ['sfx_sub_bass_thud'] },
          ],
        }
        indexCatalog(fallback.items)
        return fallback
      })
  }
  return catalogPromise
}

function getAudio(slug: string): HTMLAudioElement {
  const url = sfxPublicUrl(slug)
  let el = audioCache.get(url)
  if (!el) {
    el = new Audio(url)
    el.preload = 'auto'
    audioCache.set(url, el)
  }
  return el
}

/** Play a catalog SFX (timeline preview + toolbox hover). */
export async function playSfx(
  sfxType: string,
  volume = 0.35,
  toolId?: string,
): Promise<void> {
  if (typeof window === 'undefined') return

  await fetchSfxCatalog().catch(() => undefined)
  const slug = resolveSfxSlug(sfxType, toolId)
  const el = getAudio(slug)
  try {
    el.volume = Math.max(0.05, Math.min(1, volume))
    el.currentTime = 0
    await el.play()
  } catch {
    // Autoplay policy — ignore silent fail on hover
  }
}

/** Warm-cache common SFX after editor load. */
export function preloadCommonSfx(): void {
  void fetchSfxCatalog().then(() => {
    for (const slug of ['whoosh', 'shutter_click', 'sub_bass', 'pop', 'impact_hit']) {
      getAudio(slug).load()
    }
  })
}

export function sfxDurationMs(sfxType: string, toolId?: string): number {
  const slug = resolveSfxSlug(sfxType, toolId)
  const item = [...slugByType.entries()].find(([, s]) => s === slug)
  void item
  return 350
}
