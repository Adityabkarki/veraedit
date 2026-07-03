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

export type ProxyStatus =
  | 'pending' | 'processing' | 'ready' | 'failed' | 'skipped' | null

export interface EditorAsset {
  id:              string
  filename:        string
  durationSeconds: number | null
  status:          AssetStatus
  /** MinIO/S3 storage key for the full-quality original (export). */
  storageKey:      string
  /** Pre-signed URL the <video> element streams (edit proxy when ready). */
  videoUrl:        string | null
  proxyStatus:     ProxyStatus
  /** True when videoUrl points at the lightweight edit proxy. */
  usingProxy:      boolean
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
      ? {
          ...asset,
          proxyStatus: asset.proxyStatus ?? null,
          usingProxy: asset.usingProxy ?? false,
          errorMessage: asset.errorMessage ?? null,
        }
      : null,
  }),
  patchAsset: (patch) => set((s) => ({
    asset: s.asset ? { ...s.asset, ...patch, errorMessage: patch.errorMessage ?? s.asset.errorMessage ?? null } : s.asset,
  })),
  clearAsset: () => set({ asset: null }),
}))
