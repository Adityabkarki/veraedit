/**
 * Client-side background removal via @imgly/background-removal.
 *
 * Why in-browser (not server rembg)?
 * - Image overlays are single static assets — ideal for WASM/ONNX in the tab.
 * - $0 API cost, no upload latency, image never leaves the machine.
 * - Returns PNG with alpha — perfect for timeline stickers/overlays.
 *
 * Server rembg (Module 05) remains the right choice for full-video background work.
 */

export type BackgroundRemovalProgress = {
  phase: 'loading-model' | 'processing'
  message: string
  /** 0–100 */
  percent: number
}

export type BackgroundRemovalProgressCallback = (progress: BackgroundRemovalProgress) => void

const DEFAULT_PUBLIC_PATH =
  'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/'

/** Lazy-load the heavy ONNX bundle only when needed. */
async function loadRemover() {
  const mod = await import('@imgly/background-removal')
  return mod.removeBackground
}

/**
 * Resolve remote http(s) images to Blob so CORS + canvas pipelines behave consistently.
 */
export async function resolveImageInput(src: string): Promise<string | Blob> {
  if (src.startsWith('blob:') || src.startsWith('data:')) {
    return src
  }
  if (!/^https?:\/\//i.test(src)) {
    throw new Error('Unsupported image source. Upload the image or use a valid URL.')
  }

  const response = await fetch(src)
  if (!response.ok) {
    throw new Error('Could not load the image. Check the URL or upload the file instead.')
  }
  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) {
    throw new Error('The selected file is not a supported image format.')
  }
  return blob
}

function mapDownloadProgress(
  key: string,
  current: number,
  total: number,
  onProgress?: BackgroundRemovalProgressCallback,
) {
  if (!onProgress || total <= 0) return
  const pct = Math.round((current / total) * 100)
  onProgress({
    phase: 'loading-model',
    message: key.includes('wasm') ? 'Loading AI engine…' : 'Downloading background model…',
    percent: Math.min(99, pct),
  })
}

/**
 * Remove the background from an image source. Returns a PNG blob with transparency.
 */
export async function removeImageBackground(
  src: string,
  onProgress?: BackgroundRemovalProgressCallback,
): Promise<Blob> {
  if (!src?.trim()) {
    throw new Error('Add an image before removing the background.')
  }

  const removeBackground = await loadRemover()
  const input = await resolveImageInput(src)

  onProgress?.({
    phase: 'loading-model',
    message: 'Preparing background removal…',
    percent: 0,
  })

  try {
    const blob = await removeBackground(input, {
      publicPath: DEFAULT_PUBLIC_PATH,
      model: 'isnet_fp16',
      output: {
        format: 'image/png',
        quality: 0.92,
        type: 'foreground',
      },
      progress: (key, current, total) => mapDownloadProgress(key, current, total, onProgress),
    })

    onProgress?.({
      phase: 'processing',
      message: 'Applying result…',
      percent: 100,
    })

    if (!blob || blob.size === 0) {
      throw new Error('Background removal produced an empty image.')
    }

    return blob
  } catch (err) {
    const message =
      err instanceof Error && err.message
        ? err.message
        : 'Background removal failed. Try a smaller image or reload the page.'
    throw new Error(message)
  }
}

/** Warm the model cache (optional — e.g. when image panel opens). */
export async function preloadBackgroundRemovalModel(
  onProgress?: BackgroundRemovalProgressCallback,
): Promise<void> {
  const mod = await import('@imgly/background-removal')
  await mod.preload({
    publicPath: DEFAULT_PUBLIC_PATH,
    model: 'isnet_fp16',
    progress: (key, current, total) => mapDownloadProgress(key, current, total, onProgress),
  })
}
