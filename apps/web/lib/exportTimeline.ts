/**
 * Prepare editor timeline state for FFmpeg export.
 *
 * Ensures blob: preview URLs are persisted, per-clip asset ids are set,
 * and caption/brand metadata matches the preview layer.
 */

import { api } from '@/lib/api'
import { uploadMediaFile } from '@/lib/uploadMedia'
import { uploadVideoFile } from '@/lib/upload'
import { captionMetadataForExport } from '@/lib/captionBurnStyle'
import { useCaptionsStore, type CaptionStyle } from '@/stores/captionsStore'
import { useTimelineStore, type Clip, type Track } from '@/stores/timelineStore'
import { resolveBrandKitTheme } from '@/lib/brandKitTheme'
import { useVisualLibraryStore } from '@/stores/visualLibraryStore'
import { resolveCaptionEffectAt, isCaptionEffectClip } from '@/lib/captionEffects'
import { isBrollClip, isImageClip } from '@/lib/mediaClips'

export interface ExportPrepareResult {
  tracks: Track[]
  clips: Clip[]
  metadata: Record<string, unknown>
  warnings: string[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function deepMergeMetadata(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    const prev = out[key]
    if (isRecord(prev) && isRecord(value)) {
      out[key] = deepMergeMetadata(prev, value)
      continue
    }
    out[key] = value
  }
  return out
}

function isBlobUrl(url: string | undefined): boolean {
  return Boolean(url?.startsWith('blob:'))
}

function isHttpUrl(url: string | undefined): boolean {
  return Boolean(url && /^https?:\/\//i.test(url))
}

function clipNeedsMediaPersist(clip: Clip): boolean {
  const url = clip.effects?.mediaUrl
  if (!url || !isBlobUrl(url)) return false
  return isBrollClip(clip) || isImageClip(clip) || clip.trackId === 'music' || clip.type === 'music'
}

async function blobUrlToFile(blobUrl: string, filename: string): Promise<File> {
  const res = await fetch(blobUrl)
  if (!res.ok) {
    throw new Error(`Could not read local media (${res.status}).`)
  }
  const blob = await res.blob()
  const type = blob.type || 'application/octet-stream'
  return new File([blob], filename, { type })
}

/** Upload a blob: URL to project media storage; returns storage metadata. */
export async function persistBlobMedia(
  projectId: string,
  blobUrl: string,
  filename: string,
  kind: 'image' | 'video' | 'audio',
): Promise<{ mediaAssetId: string; storageKey?: string; url: string } | null> {
  const file = await blobUrlToFile(blobUrl, filename)

  if (kind === 'video') {
    const uploaded = await uploadVideoFile(projectId, file)
    if (!uploaded.ok || !uploaded.assetId || !uploaded.asset) {
      return null
    }
    return {
      mediaAssetId: uploaded.assetId,
      storageKey: uploaded.asset.storage_key,
      url: blobUrl,
    }
  }

  const uploaded = await uploadMediaFile(projectId, file)
  if (!uploaded.id) return null
  return {
    mediaAssetId: uploaded.id,
    storageKey: uploaded.storageKey,
    url: blobUrl,
  }
}

function guessFilename(clip: Clip): string {
  const fromEffects = clip.effects?.mediaFileName
  if (fromEffects) return fromEffects
  if (isImageClip(clip)) return 'overlay-image.png'
  if (clip.trackId === 'music' || clip.type === 'music') return 'music-track.mp3'
  return 'broll-clip.mp4'
}

function mediaKindForClip(clip: Clip): 'image' | 'video' | 'audio' {
  if (clip.trackId === 'music' || clip.type === 'music') return 'audio'
  if (clip.effects?.mediaKind === 'image') return 'image'
  if (clip.effects?.mediaKind === 'video') return 'video'
  const url = clip.effects?.mediaUrl ?? ''
  if (/\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(url)) return 'image'
  return 'video'
}

/** Upload blob media and attach storage keys before timeline save. */
export async function prepareClipsForExport(
  projectId: string,
  tracks: Track[],
  clips: Clip[],
): Promise<{ tracks: Track[]; clips: Clip[]; warnings: string[] }> {
  const warnings: string[] = []
  const nextClips: Clip[] = []

  for (const clip of clips) {
    if (!clipNeedsMediaPersist(clip)) {
      nextClips.push(clip)
      continue
    }

    const url = clip.effects?.mediaUrl!
    const kind = mediaKindForClip(clip)
    try {
      const persisted = await persistBlobMedia(projectId, url, guessFilename(clip), kind)
      if (!persisted) {
        warnings.push(`Could not upload media for "${clip.label}" — export may miss this layer.`)
        nextClips.push(clip)
        continue
      }

      const effects = {
        ...clip.effects,
        mediaAssetId: persisted.mediaAssetId,
        storageKey: persisted.storageKey ?? clip.effects?.storageKey,
        isPlaceholder: false,
      }
      if (kind === 'audio' && persisted.storageKey) {
        effects.musicStorageKey = persisted.storageKey
        effects.musicBed = true
      }
      nextClips.push({ ...clip, effects })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      warnings.push(`Media upload failed for "${clip.label}": ${msg}`)
      nextClips.push(clip)
    }
  }

  if (nextClips.some((c, i) => c !== clips[i])) {
    useTimelineStore.setState({ clips: nextClips })
  }

  return { tracks, clips: nextClips, warnings }
}

/** Serialize caption preview style + active FX config for the render worker. */
export function buildCaptionExportMetadata(
  burnInStyle: ReturnType<typeof useCaptionsStore.getState>['burnInStyle'],
  globalStyle: CaptionStyle,
  clips: Clip[],
  playheadSampleTime = 0,
): Record<string, unknown> {
  const base = captionMetadataForExport(burnInStyle, globalStyle.preset, globalStyle)
  let fx = resolveCaptionEffectAt(clips, playheadSampleTime)
  if (!fx) {
    const firstCaptionFx = clips.find((clip) => isCaptionEffectClip(clip))
    if (firstCaptionFx) {
      fx = resolveCaptionEffectAt(clips, firstCaptionFx.startTime + 0.001)
    }
  }

  return {
    ...base,
    caption_style: {
      ...(typeof base.caption_style === 'object' ? base.caption_style : {}),
      preset: globalStyle.preset,
      font_size: globalStyle.fontSize,
      color: globalStyle.color,
      background_color: globalStyle.backgroundColor,
      position: globalStyle.position,
      bold: globalStyle.bold,
      use_nepali_font: globalStyle.useNepaliFont,
    },
    caption_fx: fx?.config
      ? {
          animation: fx.config.animation,
          max_words_per_line: fx.config.maxWordsPerLine,
          caption_case: fx.config.captionCase,
          position: fx.config.position,
        }
      : null,
  }
}

/** Full export preparation: persist media + build metadata. */
export async function prepareTimelineForExport(
  projectId: string,
  baseMetadata?: Record<string, unknown>,
): Promise<ExportPrepareResult> {
  const timelineState = useTimelineStore.getState()
  const captionState = useCaptionsStore.getState()
  const brand = useVisualLibraryStore.getState().brandKit

  const { tracks, clips, warnings } = await prepareClipsForExport(
    projectId,
    timelineState.tracks,
    timelineState.clips,
  )

  const metadataPatch: Record<string, unknown> = {
    ...buildCaptionExportMetadata(captionState.burnInStyle, captionState.globalStyle, clips),
    brand_kit: {
      primary_color: brand.primaryColor,
      secondary_color: brand.secondaryColor,
      accent_color: brand.accentColor,
      font_style: brand.fontStyle,
      logo_text: brand.logoText,
    },
    theme: resolveBrandKitTheme(brand),
    export_schema_version: 2,
  }
  const metadata = deepMergeMetadata(baseMetadata ?? {}, metadataPatch)

  if (warnings.length > 0) {
    metadata.export_warnings = warnings
  }

  return { tracks, clips, metadata, warnings }
}

/** Resolve per-clip asset id for API timeline serialization. */
export function resolveClipAssetId(clip: Clip, primaryAssetId: string): string {
  if (clip.effects?.mediaAssetId) return clip.effects.mediaAssetId
  if (clip.trackId === 'video' || clip.type === 'video') return primaryAssetId
  if (
    clip.effects?.storageKey ||
    clip.effects?.musicStorageKey ||
    clip.effects?.sfxSlug ||
    clip.effects?.sfxType
  ) {
    return `clip-${clip.id}`
  }
  if (isHttpUrl(clip.effects?.mediaUrl)) {
    return `clip-${clip.id}`
  }
  if (clip.type === 'caption' || clip.trackId === 'captions') return primaryAssetId
  if (clip.type === 'effect') return primaryAssetId
  return primaryAssetId
}
