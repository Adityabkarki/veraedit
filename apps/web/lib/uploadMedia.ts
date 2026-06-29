/**
 * Upload supplementary media (images, audio, extra video) to a project.
 *
 * Files are loaded locally for preview. Backend upload happens when the
 * media is used on the timeline.
 */

import { useMediaStore, type MediaType } from '@/stores/mediaStore'

export async function uploadMediaFile(
  _projectId: string,
  file: File,
): Promise<{ id?: string; error?: string }> {
  const type: MediaType = file.type.startsWith('image/')
    ? 'image'
    : file.type.startsWith('audio/')
      ? 'audio'
      : 'video'

  const id = crypto.randomUUID()
  const blobUrl = URL.createObjectURL(file)

  useMediaStore.getState().addItem({
    id,
    name: file.name,
    type,
    url: blobUrl,
    fileSize: file.size,
  })

  return { id }
}
