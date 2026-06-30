'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  listLibraryAssets,
  uploadLibraryAsset,
  type LibraryAsset,
} from '@/lib/assetLibraryApi'

const SHOT_TYPE_ICONS: Record<string, string> = {
  talking_head: '🎙️',
  b_roll: '🎬',
  screen_recording: '🖥️',
  product_shot: '📦',
  text_card: '📝',
  logo: '🏷️',
  establishing_shot: '🏞️',
  action: '⚡',
  interview: '💬',
  unknown: '❓',
}

export function AssetLibraryGrid() {
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const loadAssets = useCallback(async () => {
    setLoading(true)
    const { data, error } = await listLibraryAssets()
    if (error) {
      toast.error(error)
    } else if (data) {
      setAssets(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadAssets()
  }, [loadAssets])

  const handleUpload = async (file: File) => {
    setUploading(true)
    const { data, error } = await uploadLibraryAsset(file)
    if (error) {
      toast.error(error)
    } else if (data) {
      setAssets((prev) => [data, ...prev])
      toast.success('Asset added to your library')
    }
    setUploading(false)
  }

  return (
    <section className="mt-10" data-testid="asset-library-grid">
      <header className="mb-4">
        <h2 className="text-lg font-display font-semibold text-text-primary">
          Asset Library
        </h2>
        <p className="text-sm text-text-secondary mt-1">
          Upload clips and images once — ViraEdit tags them automatically for template matching.
        </p>
      </header>

      <label
        className="block border-2 border-dashed border-border rounded-xl p-6 text-center
                   cursor-pointer mb-4 hover:border-accent/50 transition-colors"
      >
        <input
          type="file"
          accept="video/*,image/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleUpload(file)
            e.target.value = ''
          }}
        />
        <p className="text-sm text-text-secondary">
          {uploading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              Tagging your asset...
            </span>
          ) : (
            'Click to add a clip or image to your library'
          )}
        </p>
      </label>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-accent" aria-label="Loading library" />
        </div>
      ) : assets.length === 0 ? (
        <p className="text-sm text-text-secondary text-center py-6">
          No library assets yet. Upload a clip or image to get started.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="border border-border rounded-lg p-2 bg-surface-raised"
              data-testid={`library-asset-${asset.id}`}
            >
              <div className="aspect-video bg-surface-muted rounded mb-2 flex items-center justify-center text-2xl overflow-hidden">
                {asset.thumb_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.thumb_url}
                    alt={asset.tags.description || 'Library asset'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  SHOT_TYPE_ICONS[asset.tags.shot_type] || '❓'
                )}
              </div>
              <p className="text-xs text-text-secondary line-clamp-2">
                {asset.tags.description || 'Untitled asset'}
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                <span className="text-[10px] bg-surface-muted px-1.5 py-0.5 rounded">
                  {asset.tags.shot_type}
                </span>
                <span className="text-[10px] bg-surface-muted px-1.5 py-0.5 rounded">
                  {asset.tags.energy_level}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
