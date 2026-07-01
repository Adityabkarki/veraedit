/**
 * Editor data loader — fetches the real project/asset and populates EVERY
 * editor store from the backend, replacing mock placeholder data.
 */

import { api } from '@/lib/api'
import type { ApiTimelineResponse } from '@/lib/timelineApi'
import { syncOverlaysToVisualLibrary } from '@/lib/applySuggestionClient'
import { syncCaptionsFromTimeline } from '@/lib/captionTimelineSync'
import { saveProjectTimeline } from '@/lib/renderExport'
import { useTranscriptStore, type ApiTranscript, transcriptHasWordTimestamps } from '@/stores/transcriptStore'
import { useScenesStore, type ApiScene } from '@/stores/scenesStore'
import { useShortsStore, type ApiShort } from '@/stores/shortsStore'
import { useHighlightsStore, type ApiHighlight } from '@/stores/highlightsStore'
import { useSuggestionsStore, type ApiSuggestion } from '@/stores/suggestionsStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { ensurePrimaryMediaClips } from '@/lib/timelineLayers'
import { useAssetStore, type AssetStatus } from '@/stores/assetStore'
import { useCaptionsStore } from '@/stores/captionsStore'
import { useMediaStore } from '@/stores/mediaStore'
import { useEditorStore } from '@/stores/editorStore'
import { applyPodcastAutopilotIfNeeded } from '@/lib/podcastAutopilot'
import { useAutoEditStore } from '@/stores/autoEditStore'
import { usePlayerStore } from '@/stores/playerStore'
import { pickPrimaryProjectAsset } from '@/lib/projectAssets'

interface BackendProject {
  id: string
  name: string
  status: string
}

interface BackendAsset {
  id: string
  status: AssetStatus
  original_filename: string
  duration_seconds: number | null
  storage_key: string
  error_message?: string | null
  media_metadata?: { content_type?: string; role?: string; source?: string } | null
}

interface TranscriptApiPayload {
  status: string
  message?: string
  full_text?: string
  words?: unknown[]
}

export interface EditorLoadResult {
  projectTitle: string
  assetId: string | null
  assetStatus: AssetStatus | null
  transcriptStatus: string | null
  transcriptLoaded: boolean
  hasWordTimestamps: boolean
  contentType: string | null
  error: string | null
}

export interface LoadEditorOptions {
  /** When false, skip re-fetching timeline (avoids playhead reset during status polling). */
  reloadTimeline?: boolean
  /** Keep playhead position when timeline is reloaded (e.g. after style apply). */
  preservePlayhead?: boolean
}

/** Clear every editor data store to an empty state (no mock leakage). */
function clearAllStores() {
  useTranscriptStore.getState().loadFromApi({ full_text: '', words: [] })
  useScenesStore.getState().loadFromApi([])
  useShortsStore.getState().loadFromApi([])
  useSuggestionsStore.getState().loadFromApi([])
  useCaptionsStore.getState().resetCaptions()
  useAssetStore.getState().clearAsset()
  useTimelineStore.getState().resetTimeline()
  useAutoEditStore.getState().clearApplied()
}

async function loadProjectTimeline(
  projectId: string,
  asset: BackendAsset,
  options?: Pick<LoadEditorOptions, 'preservePlayhead'>,
): Promise<void> {
  const tl = await api.get<ApiTimelineResponse>(`/projects/${projectId}/timeline`)

  // 404 = project missing or no access — fall back to default timeline from asset
  if (tl.error && tl.status !== 404 && !tl.data) {
    return
  }

  const savedTimeline = tl.data?.data
  const hasSavedTimeline = Boolean(savedTimeline?.tracks?.length)

  if (hasSavedTimeline && savedTimeline) {
    useTimelineStore.getState().loadFromApi(savedTimeline, {
      preservePlayhead: options?.preservePlayhead,
    })
    const state = useTimelineStore.getState()
    const restored = ensurePrimaryMediaClips(state.tracks, state.clips, {
      id: asset.id,
      filename: asset.original_filename,
      durationSeconds: asset.duration_seconds ?? 0,
    })
    if (
      restored.clips.length !== state.clips.length ||
      restored.tracks.length !== state.tracks.length
    ) {
      useTimelineStore.setState({
        tracks: restored.tracks,
        clips: restored.clips,
        lastEditAction: 'Restored main video on timeline',
      })
    }
    syncOverlaysToVisualLibrary(useTimelineStore.getState().clips)
    const playhead = useTimelineStore.getState().playheadTime
    usePlayerStore.getState().seek(playhead)
    return
  }

  // No saved timeline yet — build a default clip from the uploaded asset
  if (asset.duration_seconds && asset.duration_seconds > 0) {
    useTimelineStore.getState().loadFromAsset({
      label: asset.original_filename,
      durationSeconds: asset.duration_seconds,
      assetId: asset.id,
    })
    // Persist default timeline so render/export works without manual save
    const saved = await saveProjectTimeline(projectId, 'Auto-save from upload')
    if (!saved.ok && saved.error) {
      console.warn('[viraedit] Initial timeline save failed:', saved.error)
    }
  }
}

export async function loadEditorProject(
  projectId: string,
  options: LoadEditorOptions = {},
): Promise<EditorLoadResult> {
  const { reloadTimeline = true, preservePlayhead = false } = options
  const proj = await api.get<BackendProject>(`/projects/${projectId}`)
  if (proj.error || !proj.data) {
    return {
      projectTitle: 'Untitled Project',
      assetId: null, assetStatus: null, transcriptStatus: null,
      transcriptLoaded: false,
      hasWordTimestamps: false, contentType: null,
      error: proj.error ?? 'Could not load this project.',
    }
  }
  const projectTitle = proj.data.name || 'Untitled Project'

  const assets = await api.get<BackendAsset[]>(`/projects/${projectId}/assets`)
  const preferredAssetId = reloadTimeline
    ? useAssetStore.getState().asset?.id
    : undefined
  const asset =
    assets.data && assets.data.length > 0
      ? pickPrimaryProjectAsset(assets.data, preferredAssetId)
      : null

  if (!asset) {
    clearAllStores()
    return {
      projectTitle, assetId: null, assetStatus: null, transcriptStatus: null,
      transcriptLoaded: false,
      hasWordTimestamps: false, contentType: null, error: null,
    }
  }

  const contentType = asset.media_metadata?.content_type ?? null

  if (asset.status === 'error') {
    const errMsg = asset.error_message?.trim() || 'Video processing failed.'
    if (reloadTimeline) {
      useAssetStore.getState().setAsset({
        id: asset.id,
        filename: asset.original_filename,
        durationSeconds: asset.duration_seconds,
        status: 'error',
        storageKey: asset.storage_key,
        videoUrl: useAssetStore.getState().asset?.videoUrl ?? null,
        errorMessage: errMsg,
      })
    } else {
      useAssetStore.getState().patchAsset({
        status: 'error',
        errorMessage: errMsg,
      })
    }
    return {
      projectTitle,
      assetId: asset.id,
      assetStatus: 'error',
      transcriptStatus: null,
      transcriptLoaded: false,
      hasWordTimestamps: false,
      contentType,
      error: errMsg,
    }
  }

  let videoUrl: string | null = useAssetStore.getState().asset?.videoUrl ?? null
  if (reloadTimeline && asset.status !== 'uploading') {
    const dl = await api.get<{ download_url: string }>(
      `/projects/${projectId}/assets/${asset.id}/download-url`,
    )
    if (dl.data?.download_url) videoUrl = dl.data.download_url
  }

  if (reloadTimeline) {
    useAssetStore.getState().setAsset({
      id: asset.id,
      filename: asset.original_filename,
      durationSeconds: asset.duration_seconds,
      status: asset.status,
      storageKey: asset.storage_key,
      videoUrl,
      errorMessage: null,
    })
    await loadProjectTimeline(projectId, asset, { preservePlayhead })
  } else {
    useAssetStore.getState().patchAsset({
      status: asset.status,
      durationSeconds: asset.duration_seconds,
    })
  }

  let transcriptLoaded = false
  let hasWordTimestamps = false
  let transcriptStatus: string | null = null
  const t = await api.get<ApiTranscript & TranscriptApiPayload>(
    `/projects/${projectId}/assets/${asset.id}/transcript`,
  )
  transcriptStatus = t.data?.status ?? null

  if (t.data && t.data.status === 'ready') {
    hasWordTimestamps = transcriptHasWordTimestamps(t.data)
    useTranscriptStore.getState().loadFromApi(t.data, asset.duration_seconds)
    const hasTimelineCaptions = useTimelineStore.getState().clips.some(
      (c) => c.trackId === 'captions',
    )
    if (hasTimelineCaptions) {
      syncCaptionsFromTimeline(useTimelineStore.getState().clips)
    } else if (hasWordTimestamps) {
      useCaptionsStore.getState().loadFromTranscript(t.data)
    }
    // Transcript text is usable even without per-word timestamps (captions may be limited).
    transcriptLoaded = Boolean(t.data.full_text?.trim()) || hasWordTimestamps
  } else if (t.data?.status === 'processing') {
    useTranscriptStore.getState().loadFromApi({ full_text: '', words: [] })
    useCaptionsStore.getState().resetCaptions()
  } else {
    useTranscriptStore.getState().loadFromApi({ full_text: '', words: [] })
    useCaptionsStore.getState().resetCaptions()
  }

  // Past transcription: analyzing/ready implies transcript step completed for UI.
  if (!transcriptLoaded && (asset.status === 'analyzing' || asset.status === 'ready')) {
    transcriptLoaded = true
  }

  const sc = await api.get<{ scenes: ApiScene[] }>(`/projects/${projectId}/assets/${asset.id}/scenes`)
  useScenesStore.getState().loadFromApi(Array.isArray(sc.data?.scenes) ? sc.data!.scenes : [])

  const sh = await api.get<{ shorts: ApiShort[] }>(`/projects/${projectId}/assets/${asset.id}/shorts`)
  useShortsStore.getState().loadFromApi(Array.isArray(sh.data?.shorts) ? sh.data!.shorts : [])

  const hl = await api.get<{ highlights: unknown[] }>(
    `/projects/${projectId}/assets/${asset.id}/highlights`,
  )
  useHighlightsStore.getState().loadFromApi(
    Array.isArray(hl.data?.highlights)
      ? (hl.data!.highlights as ApiHighlight[])
      : [],
  )

  const md = await api.get<Array<{ id: string; name: string; type: string; url: string; thumbnailUrl?: string | null; fileSize?: number }>>(
    `/projects/${projectId}/media`,
  )
  if (md.data && Array.isArray(md.data)) {
    useMediaStore.getState().setItems(md.data.map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type as 'video' | 'audio' | 'image',
      url: m.url,
      thumbnailUrl: m.thumbnailUrl ?? undefined,
      fileSize: m.fileSize ?? undefined,
    })))
  }

  const sg = await api.get<{ suggestions: ApiSuggestion[] }>(
    `/projects/${projectId}/assets/${asset.id}/suggestions`,
  )
  const apiSuggestions = Array.isArray(sg.data?.suggestions) ? sg.data!.suggestions : []
  useSuggestionsStore.getState().loadFromApi(apiSuggestions)

  // Podcast mode + auto-apply safe autopilot edits when analysis is complete.
  // Do not force-switch tabs during polling; users should keep their chosen panel.
  if (asset.status === 'ready' && apiSuggestions.length > 0) {
    applyPodcastAutopilotIfNeeded(projectId, contentType ?? undefined, asset.status, apiSuggestions)
  }

  return {
    projectTitle,
    assetId: asset.id,
    assetStatus: asset.status,
    transcriptStatus,
    transcriptLoaded,
    hasWordTimestamps,
    contentType,
    error: null,
  }
}

/** Re-export for editor header save button. */
export { saveProjectTimeline }
