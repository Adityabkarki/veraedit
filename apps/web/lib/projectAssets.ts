/**
 * Pick the project's primary (source) upload — not secondary B-roll/stock assets.
 */

export interface ProjectAssetLike {
  id: string
  original_filename: string
  media_metadata?: {
    role?: string
    source?: string
    content_type?: string
  } | null
}

const BROLL_METADATA_SOURCES = new Set([
  'ai_broll_generation',
  'stock_pexels',
])

/** True for stock/AI B-roll files stored as project assets (not the main upload). */
export function isSecondaryBrollAsset(asset: ProjectAssetLike): boolean {
  const md = asset.media_metadata
  if (md?.role === 'broll') return true
  const source = md?.source
  if (typeof source === 'string' && BROLL_METADATA_SOURCES.has(source)) return true
  const name = asset.original_filename?.toLowerCase() ?? ''
  return name.startsWith('broll_stock_') || name.startsWith('broll_gen_')
}

/**
 * Choose the main project video asset.
 * API lists assets newest-first; B-roll inserts create a newer row that must be ignored.
 */
export function pickPrimaryProjectAsset(
  assets: ProjectAssetLike[],
  preferredId?: string | null,
): ProjectAssetLike | null {
  if (assets.length === 0) return null

  if (preferredId) {
    const preferred = assets.find((a) => a.id === preferredId)
    if (preferred && !isSecondaryBrollAsset(preferred)) return preferred
  }

  const primaryCandidates = assets.filter((a) => !isSecondaryBrollAsset(a))
  if (primaryCandidates.length > 0) {
    // Newest-first list → last candidate is the original upload.
    return primaryCandidates[primaryCandidates.length - 1]
  }

  return assets[assets.length - 1]
}
