export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-burn'
  | 'color-dodge'
  | 'soft-light'

export type FilterPreset =
  | 'none'
  | 'cinematic_warm'
  | 'cinematic_cold'
  | 'vintage_film'
  | 'corporate_clean'
  | 'dark_moody'
  | 'bright_airy'
  | 'bw'

export type AnimationEffect =
  | 'none'
  | 'fade_in'
  | 'slide_up'
  | 'slide_left'
  | 'zoom_in'
  | 'bounce'
  | 'ken_burns'

export type ExitEffect = 'none' | 'fade_out' | 'slide_down' | 'zoom_out'

export type MaskShape = 'none' | 'rect' | 'circle' | 'star' | 'custom'

export type CropAspect = 'free' | '1:1' | '16:9' | '9:16' | '4:5'

export interface ImageTransform {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  scale: number
  flipX: boolean
  flipY: boolean
  lockAspectRatio: boolean
}

export interface ImageTiming {
  startTime: number
  endTime: number
  layer: number
}

export interface ImageAppearance {
  opacity: number
  brightness: number
  contrast: number
  saturation: number
  sharpness: number
  blur: number
  cornerRadius: number
}

export interface ImageBorder {
  width: number
  color: string
  shadowEnabled: boolean
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  shadowColor: string
  shadowOpacity: number
}

export interface ImageAnimation {
  entrance: AnimationEffect
  entranceDuration: number
  exit: ExitEffect
  exitDuration: number
}

export interface ImageLayer {
  id: string
  type: 'image'
  src: string
  storageKey: string
  name: string
  transform: ImageTransform
  timing: ImageTiming
  appearance: ImageAppearance
  blendMode: BlendMode
  filter: FilterPreset
  filterIntensity: number
  border: ImageBorder
  animation: ImageAnimation
  cropAspect: CropAspect
  maskShape: MaskShape
  locked: boolean
  visible: boolean
}

export function newImageLayerId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export function defaultImageLayer(overrides: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id: newImageLayerId(),
    type: 'image',
    src: '',
    storageKey: '',
    name: 'Image',
    transform: {
      x: 50,
      y: 50,
      width: 40,
      height: 40,
      rotation: 0,
      scale: 100,
      flipX: false,
      flipY: false,
      lockAspectRatio: true,
    },
    timing: { startTime: 0, endTime: 5, layer: 1 },
    appearance: {
      opacity: 100,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      sharpness: 0,
      blur: 0,
      cornerRadius: 0,
    },
    blendMode: 'normal',
    filter: 'none',
    filterIntensity: 100,
    border: {
      width: 0,
      color: '#ffffff',
      shadowEnabled: false,
      shadowBlur: 10,
      shadowOffsetX: 5,
      shadowOffsetY: 5,
      shadowColor: '#000000',
      shadowOpacity: 50,
    },
    animation: {
      entrance: 'none',
      entranceDuration: 0.5,
      exit: 'none',
      exitDuration: 0.5,
    },
    cropAspect: 'free',
    maskShape: 'none',
    locked: false,
    visible: true,
    ...overrides,
  }
}
