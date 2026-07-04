/**
 * Schema-driven motion graphic prop editing — mirrors backend COMPONENT_REGISTRY props.
 */

import registry from '@/lib/motionComponentRegistry.json'

export type PropFieldType =
  | 'text'
  | 'number'
  | 'color'
  | 'boolean'
  | 'select'
  | 'stringList'
  | 'numberList'
  | 'colorList'

export interface PropFieldDef {
  key: string
  type: PropFieldType
  label: string
  min?: number
  max?: number
  step?: number
  options?: Array<{ value: string; label: string }>
  placeholder?: string
  section: 'content' | 'colors' | 'style'
}

type RegistryEntry = { props: string[]; defaults: Record<string, unknown> }

const REGISTRY = registry as Record<string, RegistryEntry>

/** Per-prop overrides — label, type, range, enum options. */
const PROP_OVERRIDES: Record<string, Partial<Omit<PropFieldDef, 'key'>>> = {
  text: { type: 'text', label: 'Text', section: 'content' },
  title: { type: 'text', label: 'Title', section: 'content' },
  subtitle: { type: 'text', label: 'Subtitle', section: 'content' },
  handle: { type: 'text', label: 'Handle / @username', section: 'content' },
  author: { type: 'text', label: 'Author', section: 'content' },
  label: { type: 'text', label: 'Label', section: 'content' },
  sublabel: { type: 'text', label: 'Sublabel / region', section: 'content' },
  caption: { type: 'text', label: 'Caption', section: 'content' },
  prefix: { type: 'text', label: 'Prefix', section: 'content' },
  suffix: { type: 'text', label: 'Suffix', section: 'content' },
  unit: { type: 'text', label: 'Unit', section: 'content', placeholder: '%' },
  monogram: { type: 'text', label: 'Monogram', section: 'content', placeholder: 'A' },
  profileSrc: { type: 'text', label: 'Profile image URL', section: 'content' },
  screenSrc: { type: 'text', label: 'Screen image URL', section: 'content' },
  fontSize: { type: 'number', label: 'Font size', min: 24, max: 140, section: 'style' },
  value: { type: 'number', label: 'Value', section: 'content' },
  trend: {
    type: 'select',
    label: 'Trend',
    section: 'content',
    options: [
      { value: '1', label: 'Up' },
      { value: '0', label: 'Flat' },
      { value: '-1', label: 'Down' },
    ],
  },
  particleCount: { type: 'number', label: 'Particle count', min: 10, max: 80, section: 'style' },
  shapeCount: { type: 'number', label: 'Shape count', min: 2, max: 12, section: 'style' },
  seed: { type: 'number', label: 'Seed', min: 0, max: 999, section: 'style' },
  angle: { type: 'number', label: 'Angle', min: -180, max: 180, step: 1, section: 'style' },
  bars: { type: 'number', label: 'Bar count', min: 8, max: 48, section: 'style' },
  spokes: { type: 'number', label: 'Spokes', min: 12, max: 48, section: 'style' },
  sizePct: { type: 'number', label: 'Size %', min: 20, max: 100, section: 'style' },
  lineLengthPct: { type: 'number', label: 'Line length %', min: 10, max: 80, section: 'style' },
  density: { type: 'number', label: 'Density', min: 4, max: 40, section: 'style' },
  intensity: { type: 'number', label: 'Intensity', min: 0, max: 1, step: 0.05, section: 'style' },
  progress: { type: 'number', label: 'Progress', min: 0, max: 1, step: 0.01, section: 'content' },
  color: { type: 'color', label: 'Color', section: 'colors' },
  accentColor: { type: 'color', label: 'Accent color', section: 'colors' },
  brandColor: { type: 'color', label: 'Brand color', section: 'colors' },
  textColor: { type: 'color', label: 'Text color', section: 'colors' },
  strokeColor: { type: 'color', label: 'Text stroke', section: 'colors' },
  colorA: { type: 'color', label: 'Gradient start', section: 'colors' },
  colorB: { type: 'color', label: 'Gradient end', section: 'colors' },
  colorC: { type: 'color', label: 'Highlight', section: 'colors' },
  colors: { type: 'colorList', label: 'Particle colors', section: 'colors' },
  showAccentStroke: { type: 'boolean', label: 'Accent stroke', section: 'style' },
  showSafeGuides: { type: 'boolean', label: 'Show safe guides', section: 'style' },
  labels: { type: 'stringList', label: 'Labels', section: 'content', placeholder: 'A, B, C' },
  steps: { type: 'stringList', label: 'Steps', section: 'content', placeholder: 'Step 1, Step 2' },
  words: { type: 'stringList', label: 'Words (karaoke)', section: 'content' },
  values: { type: 'numberList', label: 'Values', section: 'content', placeholder: '40, 70, 55' },
  amplitudes: { type: 'numberList', label: 'Amplitudes', section: 'style' },
  variant: {
    type: 'select',
    label: 'Variant',
    section: 'style',
    options: [
      { value: 'slide', label: 'Slide bar' },
      { value: 'glass', label: 'Glass blur' },
      { value: 'accent_line', label: 'Accent line' },
      { value: 'underline', label: 'Underline' },
      { value: 'slash', label: 'Slash' },
      { value: 'bracket', label: 'Bracket' },
      { value: 'circle', label: 'Circle' },
      { value: 'arrow', label: 'Arrow' },
    ],
  },
  style: {
    type: 'select',
    label: 'Style',
    section: 'style',
    options: [
      { value: 'wipe', label: 'Wipe' },
      { value: 'circle', label: 'Circle' },
      { value: 'split', label: 'Split' },
      { value: 'fade_accent', label: 'Fade accent' },
    ],
  },
  direction: {
    type: 'select',
    label: 'Direction',
    section: 'style',
    options: [
      { value: 'ltr', label: 'Left to right' },
      { value: 'rtl', label: 'Right to left' },
    ],
  },
  device: {
    type: 'select',
    label: 'Device',
    section: 'style',
    options: [
      { value: 'phone', label: 'Phone' },
      { value: 'tablet', label: 'Tablet' },
      { value: 'laptop', label: 'Laptop' },
    ],
  },
  side: {
    type: 'select',
    label: 'Side',
    section: 'style',
    options: [
      { value: 'top', label: 'Top' },
      { value: 'bottom', label: 'Bottom' },
    ],
  },
  platform: {
    type: 'select',
    label: 'Platform',
    section: 'style',
    options: [
      { value: 'tiktok', label: 'TikTok' },
      { value: 'reels', label: 'Reels' },
      { value: 'shorts', label: 'Shorts' },
      { value: 'youtube', label: 'YouTube' },
    ],
  },
  burstStyle: {
    type: 'select',
    label: 'Burst style',
    section: 'style',
    options: [
      { value: 'confetti', label: 'Confetti' },
      { value: 'sparkle', label: 'Sparkle' },
    ],
  },
  region: {
    type: 'select',
    label: 'Map region',
    section: 'style',
    options: [
      { value: 'asia', label: 'Asia' },
      { value: 'europe', label: 'Europe' },
      { value: 'americas', label: 'Americas' },
      { value: 'africa', label: 'Africa' },
      { value: 'oceania', label: 'Oceania' },
    ],
  },
  activeSpeakerId: {
    type: 'select',
    label: 'Active speaker',
    section: 'content',
    options: [
      { value: 'host', label: 'Host' },
      { value: 'guest', label: 'Guest' },
    ],
  },
  beforeLabel: { type: 'text', label: 'Before label', section: 'content' },
  afterLabel: { type: 'text', label: 'After label', section: 'content' },
  leftLabel: { type: 'text', label: 'Left label', section: 'content' },
  rightLabel: { type: 'text', label: 'Right label', section: 'content' },
}

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}

function inferFieldType(key: string, defaultVal: unknown): PropFieldType {
  if (key in PROP_OVERRIDES && PROP_OVERRIDES[key]?.type) {
    return PROP_OVERRIDES[key]!.type!
  }
  if (typeof defaultVal === 'boolean') return 'boolean'
  if (Array.isArray(defaultVal)) {
    if (defaultVal.length && typeof defaultVal[0] === 'number') return 'numberList'
    if (defaultVal.length && String(defaultVal[0]).startsWith('#')) return 'colorList'
    return 'stringList'
  }
  if (typeof defaultVal === 'number') return 'number'
  if (/color/i.test(key) || key === 'color') return 'color'
  return 'text'
}

function inferSection(type: PropFieldType): PropFieldDef['section'] {
  if (type === 'color' || type === 'colorList') return 'colors'
  if (type === 'boolean' || type === 'select') return 'style'
  return 'content'
}

export function buildPropField(key: string, typeId: string): PropFieldDef | null {
  const entry = REGISTRY[typeId.toLowerCase()]
  if (!entry?.props.includes(key)) return null

  const defaultVal = entry.defaults[key]
  const override = PROP_OVERRIDES[key] ?? {}
  const fieldType = override.type ?? inferFieldType(key, defaultVal)

  return {
    key,
    type: fieldType,
    label: override.label ?? humanizeKey(key),
    min: override.min,
    max: override.max,
    step: override.step,
    options: override.options,
    placeholder: override.placeholder,
    section: override.section ?? inferSection(fieldType),
  }
}

export function getEditableFieldsForType(typeId: string): PropFieldDef[] {
  const entry = REGISTRY[typeId.toLowerCase()]
  if (!entry) return []
  return entry.props
    .map((key) => buildPropField(key, typeId))
    .filter((f): f is PropFieldDef => f != null)
}

export function getRegistryDefaults(typeId: string): Record<string, unknown> {
  return { ...(REGISTRY[typeId.toLowerCase()]?.defaults ?? {}) }
}

export function getRegistryProps(typeId: string): string[] {
  return [...(REGISTRY[typeId.toLowerCase()]?.props ?? [])]
}

/** Map prop key → clip.effects display field for sync. */
export function primaryDisplayFieldForProp(key: string): 'displayValue' | 'secondaryText' | null {
  if (key === 'text' || key === 'title') return 'displayValue'
  if (['subtitle', 'author', 'label', 'sublabel'].includes(key)) return 'secondaryText'
  return null
}

export function isColorPropKey(key: string): boolean {
  return /color/i.test(key) || key === 'colors'
}
