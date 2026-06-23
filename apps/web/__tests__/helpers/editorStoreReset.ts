/**
 * Shared helpers for resetting / seeding editor Zustand stores in tests.
 *
 * Production stores start empty and are filled by loadEditorProject().
 * Component tests that need demo fixtures call seedDemoEditorStores().
 */

import { useEditorStore, initialEditorState } from '@/stores/editorStore'
import { useAssetStore } from '@/stores/assetStore'
import { useScenesStore } from '@/stores/scenesStore'
import { useShortsStore } from '@/stores/shortsStore'
import { useTranscriptStore } from '@/stores/transcriptStore'
import { useSuggestionsStore } from '@/stores/suggestionsStore'
import { useCaptionsStore } from '@/stores/captionsStore'
import { useTimelineStore } from '@/stores/timelineStore'

/** Reset every editor data store to the same empty state used on a fresh project. */
export function resetEditorStores() {
  useEditorStore.setState({ ...initialEditorState })
  useAssetStore.getState().clearAsset()
  useScenesStore.getState().resetScenes()
  useShortsStore.getState().resetShorts()
  useTranscriptStore.getState().resetTranscript()
  useSuggestionsStore.getState().resetSuggestions()
  useCaptionsStore.getState().resetCaptions()
  useTimelineStore.getState().resetTimeline()
  localStorage.clear()
}

/** Load exported demo fixtures into stores (for component / interaction tests). */
export function seedDemoEditorStores() {
  useScenesStore.getState().loadDemoData()
  useShortsStore.getState().loadDemoData()
  useTranscriptStore.getState().loadDemoData()
  useSuggestionsStore.getState().loadDemoData()
  useTimelineStore.getState().loadDemoData()
  useCaptionsStore.getState().loadDemoData()
}
