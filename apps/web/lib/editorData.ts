/**
 * Editor data loader — fetches the real project/asset and populates EVERY
 * editor store from the backend, replacing mock placeholder data.
 */

import { api } from '@/lib/api'
import {
  isPersistedTimelineResponse,
  isTimelineStaleForAsset,
  upgradeTimelinePrimaryAsset,
  type ApiTimelineData,
  type ApiTimelineResponse,
} from '@/lib/timelineApi'
import { syncOverlaysToVisualLibrary } from '@/lib/applySuggestionClient'
import { syncCaptionsFromTimeline } from '@/lib/captionTimelineSync'
import { saveProjectTimeline } from '@/lib/renderExport'
import { useTranscriptStore, type ApiTranscript, transcriptHasWordTimestamps } from '@/stores/transcriptStore'
import { useScenesStore, type ApiScene } from '@/stores/scenesStore'
import { useShortsStore, type ApiShort } from '@/stores/shortsStore'
import { useHighlightsStore, type ApiHighlight } from '@/stores/highlightsStore'
import { useSuggestionsStore, type ApiSuggestion } from '@/stores/suggestionsStore'
import { replaceTimelineClips } from '@/lib/editor/timelineClipUpdates'
import { ensurePrimaryMediaClips } from '@/lib/timelineLayers'
import { useAssetStore, type AssetStatus, type EditorAsset, type ProxyStatus } from '@/stores/assetStore'
import { useCaptionsStore } from '@/stores/captionsStore'
import { useMediaStore } from '@/stores/mediaStore'
import { useEditorStore } from '@/stores/editorStore'
import { applyPodcastAutopilotIfNeeded } from '@/lib/podcastAutopilot'
import { useAutoEditStore } from '@/stores/autoEditStore'
import { usePlayerStore } from '@/stores/playerStore'
import { pickPrimaryProjectAsset } from '@/lib/projectAssets'
import { projectUsesDirectorEngine } from '@/lib/directorApi'
import { useDirectorStore } from '@/stores/directorStore'

interface BackendProject {
  id: string
  name: string
  status: string
  settings?: Record<string, unknown> | null
}

interface BackendAsset {
  id: string
  status: AssetStatus
  original_filename: string
  duration_seconds: number | null
  storage_key: string
  proxy_status?: ProxyStatus
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
  proxyStatus: ProxyStatus | null
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
  /** Force a specific asset as primary (e.g. right after ingest completes). */
  preferredAssetId?: string | null
}

/** Monotonic token — only the latest loadEditorProject may mutate timeline state. */
let editorLoadGeneration = 0

function scheduleInitialTimelinePersist(projectId: string, label: string): void {
  void saveProjectTimeline(projectId, label).then((saved) => {
    if (!saved.ok && saved.error) {
      console.warn('[viraedit] Timeline auto-save failed:', saved.error)
    }
  })
}

async function resolveEditPlaybackUrl(
  projectId: string,
  assetId: string,
): Promise<{ videoUrl: string | null; usingProxy: boolean }> {
  const dl = await api.get<{ download_url: string; using_proxy: boolean }>(
    `/projects/${projectId}/assets/${assetId}/download-url?variant=edit`,
  )
  if (!dl.data?.download_url) {
    return { videoUrl: null, usingProxy: false }
  }
  return {
    videoUrl: dl.data.download_url,
    usingProxy: Boolean(dl.data.using_proxy),
  }
}

/** Fetch or reuse a signed playback URL for the editor preview. */
async function resolveAssetPlayback(
  projectId: string,
  asset: BackendAsset,
  prev: EditorAsset | null,
): Promise<{ videoUrl: string | null; usingProxy: boolean }> {
  const keepUrl = prev?.id === asset.id ? prev.videoUrl : null
  const keepProxy = prev?.id === asset.id ? (prev.usingProxy ?? false) : false

  if (asset.status === 'uploading') {
    return { videoUrl: keepUrl, usingProxy: keepProxy }
  }

  const playback = await resolveEditPlaybackUrl(projectId, asset.id)
  return {
    videoUrl: playback.videoUrl ?? keepUrl,
    usingProxy: playback.videoUrl ? playback.usingProxy : keepProxy,
  }
}

/** Prime asset store immediately after upload confirm so preview works before full editor load. */
export async function primeAssetPlaybackAfterUpload(
  projectId: string,
  asset: {
    id: string
    original_filename: string
    duration_seconds: number | null
    status: AssetStatus
    storage_key: string
    proxy_status?: ProxyStatus
  },
): Promise<void> {
  if (asset.status === 'uploading') return
  const playback = await resolveEditPlaybackUrl(projectId, asset.id)
  syncAssetToStore(
    {
      id: asset.id,
      status: asset.status,
      original_filename: asset.original_filename,
      duration_seconds: asset.duration_seconds,
      storage_key: asset.storage_key,
      proxy_status: asset.proxy_status ?? null,
      error_message: null,
      media_metadata: null,
    },
    playback,
  )
}

function syncAssetToStore(
  asset: BackendAsset,
  playback: { videoUrl: string | null; usingProxy: boolean },
  errorMessage: string | null = null,
): void {
  const payload: EditorAsset = {
    id: asset.id,
    filename: asset.original_filename,
    durationSeconds: asset.duration_seconds,
    status: asset.status,
    storageKey: asset.storage_key,
    videoUrl: playback.videoUrl,
    proxyStatus: asset.proxy_status ?? null,
    usingProxy: playback.usingProxy,
    errorMessage,
  }
  const current = useAssetStore.getState().asset
  if (!current || current.id !== asset.id) {
    useAssetStore.getState().setAsset(payload)
  } else {
    useAssetStore.getState().patchAsset(payload)
  }
}

function bootstrapDefaultTimelineFromAsset(
  asset: BackendAsset,
  savedTimeline: ApiTimelineData | undefined,
  options?: Pick<LoadEditorOptions, 'preservePlayhead'>,
): void {
  if (savedTimeline?.tracks?.length) {
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
      replaceTimelineClips(restored.clips, {
        tracks: restored.tracks,
        lastEditAction: 'Restored main video on timeline',
      })
    }
  } else {
    useTimelineStore.getState().loadFromAsset({
      label: asset.original_filename,
      durationSeconds: asset.duration_seconds ?? 0,
      assetId: asset.id,
    })
  }
  syncOverlaysToVisualLibrary(useTimelineStore.getState().getFullClips())
  const playhead = useTimelineStore.getState().playheadTime
  usePlayerStore.getState().seek(playhead)
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
  useDirectorStore.getState().reset()
}

async function loadProjectTimeline(
  projectId: string,
  asset: BackendAsset,
  options?: Pick<LoadEditorOptions, 'preservePlayhead'> & { loadId?: number },
): Promise<void> {
  const loadId = options?.loadId ?? editorLoadGeneration
  const tl = await api.get<ApiTimelineResponse>(`/projects/${projectId}/timeline`)

  if (loadId !== editorLoadGeneration) return

  // 404 = project missing or no access — fall back to default timeline from asset
  if (tl.error && tl.status !== 404 && !tl.data) {
    return
  }

  const savedTimeline = tl.data?.data
  const hasPersistedTimeline = isPersistedTimelineResponse(tl.data)
  const hasSavedTimeline =
    hasPersistedTimeline && Boolean(savedTimeline?.tracks?.length)

  if (
    hasSavedTimeline &&
    savedTimeline &&
    isTimelineStaleForAsset(savedTimeline, asset.id)
  ) {
    const upgraded = upgradeTimelinePrimaryAsset(savedTimeline, {
      id: asset.id,
      filename: asset.original_filename,
      durationSeconds: asset.duration_seconds ?? 0,
    })
    if (loadId !== editorLoadGeneration) return
    useTimelineStore.getState().loadFromApi(upgraded, {
      preservePlayhead: options?.preservePlayhead,
    })
    syncOverlaysToVisualLibrary(useTimelineStore.getState().clips)
    const saved = await saveProjectTimeline(projectId, 'Upgraded timeline for new main video')
    if (!saved.ok && saved.error) {
      console.warn('[viraedit] Timeline upgrade save failed:', saved.error)
    }
    if (loadId !== editorLoadGeneration) return
    const playhead = useTimelineStore.getState().playheadTime
    usePlayerStore.getState().seek(playhead)
    return
  }

  if (hasSavedTimeline && savedTimeline) {
    if (loadId !== editorLoadGeneration) return
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
      if (loadId !== editorLoadGeneration) return
      replaceTimelineClips(restored.clips, {
        tracks: restored.tracks,
        lastEditAction: 'Restored main video on timeline',
      })
    }
    syncOverlaysToVisualLibrary(useTimelineStore.getState().getFullClips())
    if (loadId !== editorLoadGeneration) return
    const playhead = useTimelineStore.getState().playheadTime
    usePlayerStore.getState().seek(playhead)
    return
  }

  // Synthetic empty timeline or first upload — bootstrap clips, persist in background
  const effectiveDuration = Math.max(0.1, asset.duration_seconds ?? 0)
  if (asset.status !== 'uploading' || effectiveDuration > 0) {
    if (loadId !== editorLoadGeneration) return
    bootstrapDefaultTimelineFromAsset(
      { ...asset, duration_seconds: asset.duration_seconds ?? effectiveDuration },
      savedTimeline,
      options,
    )
    scheduleInitialTimelinePersist(projectId, 'Auto-save from upload')
  }
}

export async function loadEditorProject(
  projectId: string,
  options: LoadEditorOptions = {},
): Promise<EditorLoadResult> {
  const loadId = ++editorLoadGeneration
  const { reloadTimeline = true, preservePlayhead = false, preferredAssetId: forcedAssetId } = options

  const [proj, assetsRes] = await Promise.all([
    api.get<BackendProject>(`/projects/${projectId}`),
    api.get<BackendAsset[]>(`/projects/${projectId}/assets`),
  ])

  if (proj.error || !proj.data) {
    return {
      projectTitle: 'Untitled Project',
      assetId: null, assetStatus: null, proxyStatus: null, transcriptStatus: null,
      transcriptLoaded: false,
      hasWordTimestamps: false, contentType: null,
      error: proj.error ?? 'Could not load this project.',
    }
  }
  const projectTitle = proj.data.name || 'Untitled Project'
  const directorEnabled = projectUsesDirectorEngine(proj.data.settings)
  useDirectorStore.getState().setProjectContext(projectId, directorEnabled)
  if (!directorEnabled) {
    useTimelineStore.getState().setDirectorTimelineId(null)
  }

  const preferredAssetId = forcedAssetId
    ?? (reloadTimeline ? useAssetStore.getState().asset?.id : undefined)
  const asset =
    assetsRes.data && assetsRes.data.length > 0
      ? pickPrimaryProjectAsset(assetsRes.data, preferredAssetId)
      : null

  if (!asset) {
    clearAllStores()
    return {
      projectTitle, assetId: null, assetStatus: null, proxyStatus: null, transcriptStatus: null,
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
        proxyStatus: asset.proxy_status ?? null,
        usingProxy: false,
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
      proxyStatus: asset.proxy_status ?? null,
      transcriptStatus: null,
      transcriptLoaded: false,
      hasWordTimestamps: false,
      contentType,
      error: errMsg,
    }
  }

  let videoUrl: string | null = useAssetStore.getState().asset?.videoUrl ?? null
  let usingProxy = useAssetStore.getState().asset?.usingProxy ?? false
  const prevAsset = useAssetStore.getState().asset
  const playback = await resolveAssetPlayback(projectId, asset, prevAsset)
  videoUrl = playback.videoUrl
  usingProxy = playback.usingProxy

  if (reloadTimeline) {
    useAssetStore.getState().setAsset({
      id: asset.id,
      filename: asset.original_filename,
      durationSeconds: asset.duration_seconds,
      status: asset.status,
      storageKey: asset.storage_key,
      videoUrl,
      proxyStatus: asset.proxy_status ?? null,
      usingProxy,
      errorMessage: null,
    })
    await loadProjectTimeline(projectId, asset, { preservePlayhead, loadId })
  } else {
    syncAssetToStore(asset, playback)
  }

  if (directorEnabled) {
    void useDirectorStore.getState().loadTimeline(projectId).then(() => {
      const directorState = useDirectorStore.getState()
      useTimelineStore.getState().setDirectorTimelineId(directorState.timelineId)
    })
  }

  const [
    t,
    sc,
    sh,
    hl,
    md,
    sg,
  ] = await Promise.all([
    api.get<ApiTranscript & TranscriptApiPayload>(
      `/projects/${projectId}/assets/${asset.id}/transcript`,
    ),
    api.get<{ scenes: ApiScene[] }>(`/projects/${projectId}/assets/${asset.id}/scenes`),
    api.get<{ shorts: ApiShort[] }>(`/projects/${projectId}/assets/${asset.id}/shorts`),
    api.get<{ highlights: unknown[] }>(
      `/projects/${projectId}/assets/${asset.id}/highlights`,
    ),
    api.get<Array<{ id: string; name: string; type: string; url: string; thumbnailUrl?: string | null; fileSize?: number }>>(
      `/projects/${projectId}/media`,
    ),
    api.get<{ suggestions: ApiSuggestion[] }>(
      `/projects/${projectId}/assets/${asset.id}/suggestions`,
    ),
  ])

  let transcriptLoaded = false
  let hasWordTimestamps = false
  let transcriptStatus: string | null = t.data?.status ?? null

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

  useScenesStore.getState().loadFromApi(Array.isArray(sc.data?.scenes) ? sc.data!.scenes : [])
  useShortsStore.getState().loadFromApi(Array.isArray(sh.data?.shorts) ? sh.data!.shorts : [])
  useHighlightsStore.getState().loadFromApi(
    Array.isArray(hl.data?.highlights)
      ? (hl.data!.highlights as ApiHighlight[])
      : [],
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
    proxyStatus: asset.proxy_status ?? null,
    transcriptStatus,
    transcriptLoaded,
    hasWordTimestamps,
    contentType,
    error: null,
  }
}

/**
 * Lightweight status refresh while transcription/analysis run.
 * Avoids reloading the full editor (timeline, scenes, shorts, etc.) every poll tick.
 */
export async function refreshPipelineAssetStatus(
  projectId: string,
): Promise<EditorLoadResult> {
  const assetsRes = await api.get<BackendAsset[]>(`/projects/${projectId}/assets`)
  const asset =
    assetsRes.data && assetsRes.data.length > 0
      ? pickPrimaryProjectAsset(assetsRes.data)
      : null

  if (!asset) {
    return {
      projectTitle: 'Untitled Project',
      assetId: null,
      assetStatus: null,
      proxyStatus: null,
      transcriptStatus: null,
      transcriptLoaded: false,
      hasWordTimestamps: false,
      contentType: null,
      error: null,
    }
  }

  const contentType = asset.media_metadata?.content_type ?? null

  if (asset.status === 'error') {
    useAssetStore.getState().patchAsset({
      status: 'error',
      errorMessage: asset.error_message?.trim() || 'Video processing failed.',
    })
    return {
      projectTitle: 'Untitled Project',
      assetId: asset.id,
      assetStatus: 'error',
      proxyStatus: asset.proxy_status ?? null,
      transcriptStatus: null,
      transcriptLoaded: false,
      hasWordTimestamps: false,
      contentType,
      error: asset.error_message?.trim() || 'Video processing failed.',
    }
  }

  let videoUrl: string | null = useAssetStore.getState().asset?.videoUrl ?? null
  let usingProxy = useAssetStore.getState().asset?.usingProxy ?? false
  const prevAsset = useAssetStore.getState().asset
  const playback = await resolveAssetPlayback(projectId, asset, prevAsset)
  videoUrl = playback.videoUrl
  usingProxy = playback.usingProxy

  syncAssetToStore(asset, { videoUrl, usingProxy })

  const t = await api.get<ApiTranscript & TranscriptApiPayload>(
    `/projects/${projectId}/assets/${asset.id}/transcript`,
  )
  const transcriptStatus = t.data?.status ?? null
  let transcriptLoaded = false
  let hasWordTimestamps = false

  if (t.data?.status === 'ready') {
    hasWordTimestamps = transcriptHasWordTimestamps(t.data)
    transcriptLoaded = Boolean(t.data.full_text?.trim()) || hasWordTimestamps
  }
  if (!transcriptLoaded && (asset.status === 'analyzing' || asset.status === 'ready')) {
    transcriptLoaded = true
  }

  return {
    projectTitle: 'Untitled Project',
    assetId: asset.id,
    assetStatus: asset.status,
    proxyStatus: asset.proxy_status ?? null,
    transcriptStatus,
    transcriptLoaded,
    hasWordTimestamps,
    contentType,
    error: null,
  }
}

/**
 * Reload only the timeline from the API (e.g. after backend B-roll insert).
 * Lighter than loadEditorProject and ignores stale concurrent full loads.
 */
export async function reloadProjectTimeline(
  projectId: string,
  options?: Pick<LoadEditorOptions, 'preservePlayhead'>,
): Promise<boolean> {
  const loadId = ++editorLoadGeneration
  const storeAsset = useAssetStore.getState().asset
  if (!storeAsset?.id) return false

  const assets = await api.get<BackendAsset[]>(`/projects/${projectId}/assets`)
  if (loadId !== editorLoadGeneration) return false

  const backendAsset = assets.data?.find((a) => a.id === storeAsset.id)
    ?? pickPrimaryProjectAsset(assets.data ?? [], storeAsset.id)
  if (!backendAsset) return false

  await loadProjectTimeline(projectId, backendAsset, {
    preservePlayhead: options?.preservePlayhead,
    loadId,
  })
  return loadId === editorLoadGeneration
}

/** Re-export for editor header save button. */
export { saveProjectTimeline }
