/**
 * Upload supplementary media (images, audio, extra video) to a project.
 *
 * Files are uploaded to the backend for persistence across page refreshes.
 */

import { api } from '@/lib/api'
import { useMediaStore, type MediaItem, type MediaType } from '@/stores/mediaStore'

const TYPE_MAP: Record<string, MediaType> = {
  image: 'image',
  audio: 'audio',
  video: 'video',
}

export async function uploadMediaFile(
  projectId: string,
  file: File,
): Promise<{ id?: string; error?: string }> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await api.postForm<{
    id: string
    name: string
    type: string
    url: string
    storageKey?: string
    fileSize?: number
  }>(`/projects/${projectId}/media`, formData)

  if (res.error || !res.data) {
    return { error: res.error ?? 'Upload failed.' }
  }

  const item: MediaItem = {
    id: res.data.id,
    name: res.data.name,
    type: TYPE_MAP[res.data.type] ?? 'video',
    url: res.data.url,
    fileSize: res.data.fileSize,
  }

  useMediaStore.getState().addItem(item)

  return { id: item.id, storageKey: res.data.storageKey }
}
