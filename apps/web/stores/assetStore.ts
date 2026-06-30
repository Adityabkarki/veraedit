/**
 * Asset Store — Zustand
 *
 * Holds the current project's media asset (the uploaded video) so the editor
 * can show it in the Media tab and play it in the video preview.
 *
 * Populated by lib/editorData.loadEditorProject from the backend. NOT
 * persisted — it reflects whatever project the editor currently has open.
 */

import { create } from 'zustand'

export type AssetStatus =
  | 'uploading' | 'uploaded' | 'transcribing' | 'analyzing' | 'ready' | 'error'

export interface EditorAsset {
  id:              string
  filename:        string
  durationSeconds: number | null
  status:          AssetStatus
  /** MinIO/S3 storage key used for cut/transcode jobs. */
  storageKey:      string
  /** Pre-signed MinIO URL the <video> element can stream from (1h TTL). */
  videoUrl:        string | null
  /** Set when status is error (from backend error_message). */
  errorMessage:    string | null
}

export interface AssetState {
  asset: EditorAsset | null
  setAsset:   (asset: EditorAsset | null) => void
  patchAsset: (patch: Partial<EditorAsset>) => void
  clearAsset: () => void
}

export const useAssetStore = create<AssetState>((set) => ({
  asset: null,
  setAsset:   (asset) => set({
    asset: asset
      ? { ...asset, errorMessage: asset.errorMessage ?? null }
      : null,
  }),
  patchAsset: (patch) => set((s) => ({
    asset: s.asset ? { ...s.asset, ...patch, errorMessage: patch.errorMessage ?? s.asset.errorMessage ?? null } : s.asset,
  })),
  clearAsset: () => set({ asset: null }),
}))
