/**
 * Motion graphics pro component catalog — mirrors backend COMPONENT_REGISTRY.
 */

export interface MotionGraphicComponentDef {
  type: string
  label: string
  category: string
  description: string
  icon: string
  duration: number
  animations: { enter: string[]; exit: string[] }
  defaults: Record<string, string | number | boolean | string[]>
  position: { xPct: number; yPct: number }
}

export const MOTION_GRAPHIC_PRO_TYPES = new Set([
  'animated_title',
  'kinetic_text',
  'lower_third_pro',
  'stat_counter',
  'quote_callout',
  'cta_badge',
  'progress_timer',
  'particle_burst',
  'shape_transition',
  'background_gradient',
  'arrow_callout',
  'end_card',
])

export const MOTION_GRAPHICS_LIBRARY: MotionGraphicComponentDef[] = [
  {
    type: 'animated_title',
    label: 'Animated Title',
    category: 'titles',
    description: 'Hero title with word-by-word pop',
    icon: '✦',
    duration: 3.5,
    animations: { enter: ['word_pop', 'slide_up', 'blur_in', 'scale_bounce'], exit: ['fade', 'slide_down'] },
    defaults: { text: 'Your hook title', fontSize: 72, color: '#FFFFFF', accentColor: '#FFD600' },
    position: { xPct: 50, yPct: 28 },
  },
  {
    type: 'kinetic_text',
    label: 'Kinetic Text',
    category: 'typography',
    description: 'Words appear one by one with energy',
    icon: '⚡',
    duration: 4,
    animations: { enter: ['pop', 'rotate_in'], exit: ['fade'] },
    defaults: { text: 'Make every word count', color: '#FFFFFF', accentColor: '#FF6B00', fontSize: 76 },
    position: { xPct: 50, yPct: 45 },
  },
  {
    type: 'lower_third_pro',
    label: 'Lower Third',
    category: 'lower_thirds',
    description: 'Name + role bar',
    icon: '▬',
    duration: 4,
    animations: { enter: ['slide_left', 'fade'], exit: ['fade', 'slide_left'] },
    defaults: { title: 'Speaker Name', subtitle: 'Role or topic', brandColor: '#3B82F6', variant: 'slide' },
    position: { xPct: 28, yPct: 88 },
  },
  {
    type: 'stat_counter',
    label: 'Stat Counter',
    category: 'data',
    description: 'Count-up number with label',
    icon: '#',
    duration: 3,
    animations: { enter: ['count_up'], exit: ['fade'] },
    defaults: { value: 1000, prefix: '', suffix: '+', label: 'Metric', brandColor: '#3B82F6' },
    position: { xPct: 50, yPct: 40 },
  },
  {
    type: 'quote_callout',
    label: 'Quote',
    category: 'typography',
    description: 'Quote with quotation marks',
    icon: '"',
    duration: 4,
    animations: { enter: ['fade_up'], exit: ['fade'] },
    defaults: { text: 'A memorable quote', author: '', brandColor: '#3B82F6' },
    position: { xPct: 50, yPct: 50 },
  },
  {
    type: 'cta_badge',
    label: 'CTA Badge',
    category: 'cta',
    description: 'Pulsing subscribe / follow pill',
    icon: '●',
    duration: 3,
    animations: { enter: ['pop_pulse'], exit: ['fade'] },
    defaults: { text: 'Subscribe', brandColor: '#EF4444', textColor: '#FFFFFF' },
    position: { xPct: 50, yPct: 82 },
  },
  {
    type: 'progress_timer',
    label: 'Progress Bar',
    category: 'data',
    description: 'Chapter or countdown bar',
    icon: '▰',
    duration: 5,
    animations: { enter: ['fill'], exit: ['fade'] },
    defaults: { label: 'Chapter 1', brandColor: '#3B82F6', direction: 'ltr' },
    position: { xPct: 50, yPct: 92 },
  },
  {
    type: 'particle_burst',
    label: 'Particle Burst',
    category: 'effects',
    description: 'Confetti / sparkle burst',
    icon: '✨',
    duration: 2,
    animations: { enter: ['burst'], exit: ['fade'] },
    defaults: {
      particleCount: 40,
      colors: ['#FFD600', '#FF6B00', '#3B82F6', '#FFFFFF'],
      seed: 42,
      burstStyle: 'confetti',
    },
    position: { xPct: 50, yPct: 50 },
  },
  {
    type: 'shape_transition',
    label: 'Transition',
    category: 'transitions',
    description: 'Full-frame wipe or circle',
    icon: '◐',
    duration: 1,
    animations: { enter: ['wipe'], exit: ['wipe'] },
    defaults: { style: 'wipe', color: '#000000' },
    position: { xPct: 50, yPct: 50 },
  },
  {
    type: 'background_gradient',
    label: 'Gradient BG',
    category: 'effects',
    description: 'Animated gradient backdrop',
    icon: '◎',
    duration: 6,
    animations: { enter: ['fade'], exit: ['fade'] },
    defaults: { colorA: '#1E3A5F', colorB: '#3B82F6', shapeCount: 6, seed: 7 },
    position: { xPct: 50, yPct: 50 },
  },
  {
    type: 'arrow_callout',
    label: 'Arrow Callout',
    category: 'callouts',
    description: 'Animated arrow + label',
    icon: '→',
    duration: 3,
    animations: { enter: ['draw'], exit: ['fade'] },
    defaults: { text: 'Look here', angle: 0, brandColor: '#FFD600' },
    position: { xPct: 65, yPct: 55 },
  },
  {
    type: 'end_card',
    label: 'End Card',
    category: 'cta',
    description: 'End screen with handle',
    icon: '▣',
    duration: 5,
    animations: { enter: ['rise'], exit: ['fade'] },
    defaults: {
      title: 'Thanks for watching',
      subtitle: 'Like & subscribe',
      handle: '@yourchannel',
      brandColor: '#3B82F6',
    },
    position: { xPct: 50, yPct: 50 },
  },
]

export function getMotionGraphicDef(type: string): MotionGraphicComponentDef | undefined {
  return MOTION_GRAPHICS_LIBRARY.find((c) => c.type === type)
}

export function isMotionGraphicProType(visualType: string): boolean {
  return MOTION_GRAPHIC_PRO_TYPES.has(visualType.toLowerCase())
}

export function motionGraphicProLabel(type: string): string {
  return getMotionGraphicDef(type)?.label ?? 'Motion graphic'
}

/** Build clip effects for inserting a pro motion graphic at playhead. */
export function buildMotionGraphicClipEffects(
  type: string,
  brandColor = '#3B82F6',
): Record<string, unknown> {
  const def = getMotionGraphicDef(type)
  if (!def) return { visualType: type }

  const motionProps = { ...def.defaults }
  if ('brandColor' in motionProps || type.includes('third') || type === 'end_card') {
    motionProps.brandColor = brandColor
  }

  return {
    visualType: type,
    xPct: def.position.xPct,
    yPct: def.position.yPct,
    motionEnter: def.animations.enter[0],
    motionExit: def.animations.exit[0],
    motionEnterDuration: 0.5,
    motionExitDuration: 0.35,
    motionProps,
    displayValue: String(motionProps.text ?? motionProps.title ?? ''),
    secondaryText: String(motionProps.subtitle ?? motionProps.label ?? motionProps.author ?? ''),
    brandColor,
  }
}
