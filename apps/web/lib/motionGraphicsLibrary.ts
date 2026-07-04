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
  defaults: Record<string, string | number | boolean | string[] | number[]>
  position: { xPct: number; yPct: number }
}

export const MOTION_GRAPHIC_PRO_TYPES = new Set([
  'animated_title', 'kinetic_text', 'kinetic_line', 'karaoke_caption',
  'quote_callout', 'soundbite', 'accent_stroke', 'arrow_callout', 'callout_line',
  'doodle_scribble', 'cta_badge', 'subscribe_badge', 'end_card',
  'lower_third_pro', 'broadcast_lower_third', 'name_plate', 'guest_intro',
  'chapter_marker', 'voice_waveform', 'eq_visualizer', 'circular_waveform',
  'focus_frame', 'social_frame',
  'stat_counter', 'data_reveal', 'bar_chart', 'line_chart', 'comparison_chart',
  'pie_chart', 'funnel_chart', 'timeline_flow', 'corporate_timeline',
  'authority_badge', 'progress_timer', 'map_pin', 'icon_pop', 'glass_card', 'parallax_slide',
  'product_highlight', 'product_reveal', 'feature_callout', 'price_popup',
  'before_after', 'device_mockup', 'split_screen', 'grid_layout',
  'particle_burst', 'shape_transition', 'pro_wipe', 'whip_transition', 'zoom_transition',
  'background_gradient', 'background_shader', 'texture_bg', 'halftone',
  'geometric_pattern', 'liquid_blob', 'glitch_overlay', 'paper_rip',
  'collage_frame', 'hud_grid', 'hud_loader',
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
    defaults: {
      text: 'Your hook title',
      fontSize: 72,
      color: '#FFFFFF',
      accentColor: '#FFD600',
      showAccentStroke: true,
    },
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
  {
    type: 'bar_chart',
    label: 'Bar Chart',
    category: 'data',
    description: 'Animated bars for comparisons',
    icon: '▮',
    duration: 4.5,
    animations: { enter: ['grow', 'spring_in'], exit: ['fade'] },
    defaults: {
      title: 'Key metrics',
      labels: ['A', 'B', 'C'],
      values: [40, 70, 55],
      brandColor: '#3B82F6',
      accentColor: '#FFD600',
      unit: '',
    },
    position: { xPct: 50, yPct: 48 },
  },
  {
    type: 'line_chart',
    label: 'Line Chart',
    category: 'data',
    description: 'Animated trend line',
    icon: '╱',
    duration: 4.5,
    animations: { enter: ['draw', 'spring_in'], exit: ['fade'] },
    defaults: {
      title: 'Trend',
      labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      values: [20, 45, 38, 72],
      brandColor: '#3B82F6',
      accentColor: '#22D3EE',
      unit: '',
    },
    position: { xPct: 50, yPct: 48 },
  },
  {
    type: 'map_pin',
    label: 'Map Pin',
    category: 'data',
    description: 'Stylized map with location pin',
    icon: '📍',
    duration: 3.5,
    animations: { enter: ['drop', 'spring_in'], exit: ['fade'] },
    defaults: {
      label: 'Kathmandu',
      sublabel: 'Nepal',
      brandColor: '#EF4444',
      accentColor: '#FFD600',
      region: 'asia',
    },
    position: { xPct: 50, yPct: 45 },
  },
  {
    type: 'background_shader',
    label: 'Shader BG',
    category: 'effects',
    description: 'Animated mesh-gradient backdrop',
    icon: '◈',
    duration: 8,
    animations: { enter: ['fade'], exit: ['fade'] },
    defaults: {
      colorA: '#0F172A',
      colorB: '#1E3A5F',
      colorC: '#3B82F6',
      intensity: 0.6,
      seed: 11,
    },
    position: { xPct: 50, yPct: 50 },
  },
  {
    type: 'comparison_chart',
    label: 'Comparison',
    category: 'data',
    description: 'Horizontal comparison bars',
    icon: '☰',
    duration: 4.5,
    animations: { enter: ['grow', 'spring_in'], exit: ['fade'] },
    defaults: {
      title: 'Compared',
      labels: ['Option A', 'Option B'],
      values: [65, 35],
      brandColor: '#3B82F6',
      accentColor: '#FFD600',
      unit: '%',
    },
    position: { xPct: 50, yPct: 48 },
  },
  {
    type: 'halftone',
    label: 'Halftone',
    category: 'effects',
    description: 'Print-style dot screen (VOX)',
    icon: '⠿',
    duration: 4,
    animations: { enter: ['reveal', 'fade'], exit: ['fade'] },
    defaults: { color: '#FFD600', density: 18, intensity: 0.35, seed: 3 },
    position: { xPct: 50, yPct: 50 },
  },
  {
    type: 'accent_stroke',
    label: 'Accent Stroke',
    category: 'callouts',
    description: 'Animated underline or bracket',
    icon: '―',
    duration: 3,
    animations: { enter: ['stroke_draw', 'spring_in'], exit: ['fade'] },
    defaults: { label: 'Key point', brandColor: '#FFD600', variant: 'underline' },
    position: { xPct: 50, yPct: 55 },
  },
  // Podcast
  {
    type: 'name_plate',
    label: 'Name Plate',
    category: 'podcast',
    description: 'Guest name plate with role',
    icon: '▭',
    duration: 4,
    animations: { enter: ['slide_left', 'spring_in'], exit: ['fade'] },
    defaults: { title: 'Guest Name', subtitle: 'Title / Company', brandColor: '#3B82F6', accentColor: '#FFD600' },
    position: { xPct: 28, yPct: 88 },
  },
  {
    type: 'guest_intro',
    label: 'Guest Intro',
    category: 'podcast',
    description: 'Full guest introduction card',
    icon: '◎',
    duration: 4,
    animations: { enter: ['rise', 'spring_in'], exit: ['fade'] },
    defaults: { title: "Today's Guest", subtitle: 'Expert & Founder', label: 'EPISODE GUEST', brandColor: '#3B82F6', accentColor: '#FFD600' },
    position: { xPct: 50, yPct: 42 },
  },
  {
    type: 'chapter_marker',
    label: 'Chapter Marker',
    category: 'podcast',
    description: 'Chapter title with transition bar',
    icon: '▸',
    duration: 3,
    animations: { enter: ['slide_up', 'fade'], exit: ['fade'] },
    defaults: { title: 'Chapter 1', subtitle: 'Getting started', brandColor: '#3B82F6', accentColor: '#FFD600' },
    position: { xPct: 50, yPct: 22 },
  },
  {
    type: 'voice_waveform',
    label: 'Voice Waveform',
    category: 'podcast',
    description: 'Animated voice waveform',
    icon: '∿',
    duration: 5,
    animations: { enter: ['grow', 'fade'], exit: ['fade'] },
    defaults: { brandColor: '#3B82F6', accentColor: '#22D3EE', bars: 24, seed: 9 },
    position: { xPct: 50, yPct: 78 },
  },
  {
    type: 'focus_frame',
    label: 'Focus Frame',
    category: 'podcast',
    description: 'Talking-head focus frame + vignette',
    icon: '⬚',
    duration: 8,
    animations: { enter: ['fade', 'reveal'], exit: ['fade'] },
    defaults: { brandColor: '#FFFFFF', intensity: 0.45 },
    position: { xPct: 50, yPct: 50 },
  },
  {
    type: 'soundbite',
    label: 'Soundbite',
    category: 'podcast',
    description: 'Pull-quote soundbite with waveform',
    icon: '❝',
    duration: 4,
    animations: { enter: ['fade_up', 'spring_in'], exit: ['fade'] },
    defaults: { text: 'The moment that changed everything', label: 'SOUNDBITE', brandColor: '#FFD600', accentColor: '#FFFFFF' },
    position: { xPct: 50, yPct: 48 },
  },
  // Consultancy
  {
    type: 'data_reveal',
    label: 'Data Reveal',
    category: 'consultancy',
    description: 'Animated data card reveal',
    icon: '▣',
    duration: 3.5,
    animations: { enter: ['reveal', 'spring_in'], exit: ['fade'] },
    defaults: { title: 'Insight', value: 87, suffix: '%', label: 'Client satisfaction', brandColor: '#3B82F6', accentColor: '#FFD600' },
    position: { xPct: 50, yPct: 45 },
  },
  {
    type: 'timeline_flow',
    label: 'Timeline Flow',
    category: 'consultancy',
    description: 'Process flow steps',
    icon: '→',
    duration: 5,
    animations: { enter: ['grow', 'spring_in'], exit: ['fade'] },
    defaults: { title: 'Our process', steps: ['Discover', 'Design', 'Deliver', 'Scale'], brandColor: '#3B82F6', accentColor: '#FFD600' },
    position: { xPct: 50, yPct: 48 },
  },
  {
    type: 'authority_badge',
    label: 'Authority Badge',
    category: 'consultancy',
    description: 'Trust / authority badge',
    icon: '★',
    duration: 3,
    animations: { enter: ['pop', 'spring_in'], exit: ['fade'] },
    defaults: { title: 'Trusted by 500+', subtitle: 'Enterprise clients', brandColor: '#3B82F6', accentColor: '#FFD600' },
    position: { xPct: 50, yPct: 70 },
  },
  {
    type: 'pro_wipe',
    label: 'Pro Wipe',
    category: 'transitions',
    description: 'Clean wipe with accent edge',
    icon: '▷',
    duration: 1,
    animations: { enter: ['wipe'], exit: ['wipe'] },
    defaults: { color: '#0F172A', accentColor: '#3B82F6', style: 'wipe' },
    position: { xPct: 50, yPct: 50 },
  },
  // Product
  {
    type: 'product_highlight',
    label: 'Product Highlight',
    category: 'product',
    description: 'Highlight box with shine sweep',
    icon: '◇',
    duration: 4,
    animations: { enter: ['spring_in', 'fade'], exit: ['fade'] },
    defaults: { title: 'New Product', subtitle: 'Built for creators', brandColor: '#3B82F6', accentColor: '#FFFFFF' },
    position: { xPct: 50, yPct: 48 },
  },
  {
    type: 'product_reveal',
    label: 'Product Reveal',
    category: 'product',
    description: 'Dramatic product reveal',
    icon: '✦',
    duration: 4,
    animations: { enter: ['reveal', 'scale_bounce'], exit: ['fade'] },
    defaults: { title: 'Introducing', subtitle: 'The future is here', brandColor: '#8B5CF6', accentColor: '#FFD600' },
    position: { xPct: 50, yPct: 50 },
  },
  {
    type: 'feature_callout',
    label: 'Feature Callout',
    category: 'product',
    description: 'Feature / benefit card',
    icon: '①',
    duration: 3.5,
    animations: { enter: ['slide_left', 'spring_in'], exit: ['fade'] },
    defaults: { title: 'Fast setup', subtitle: 'Go live in minutes', label: '01', brandColor: '#3B82F6', accentColor: '#FFD600' },
    position: { xPct: 30, yPct: 40 },
  },
  {
    type: 'price_popup',
    label: 'Price Popup',
    category: 'product',
    description: 'Price or offer popup',
    icon: '$',
    duration: 3,
    animations: { enter: ['pop_pulse', 'spring_in'], exit: ['fade'] },
    defaults: { title: '$49', subtitle: 'Limited offer', label: 'SAVE 40%', brandColor: '#EF4444', accentColor: '#FFD600' },
    position: { xPct: 50, yPct: 55 },
  },
  {
    type: 'before_after',
    label: 'Before / After',
    category: 'product',
    description: 'Animated before-after slider',
    icon: '⇄',
    duration: 4,
    animations: { enter: ['draw', 'reveal'], exit: ['fade'] },
    defaults: { beforeLabel: 'Before', afterLabel: 'After', brandColor: '#3B82F6', accentColor: '#22C55E' },
    position: { xPct: 50, yPct: 48 },
  },
  {
    type: 'texture_bg',
    label: 'Texture BG',
    category: 'effects',
    description: 'Subtle animated texture backdrop',
    icon: '░',
    duration: 8,
    animations: { enter: ['fade'], exit: ['fade'] },
    defaults: { colorA: '#0F172A', colorB: '#1E293B', intensity: 0.4, seed: 5 },
    position: { xPct: 50, yPct: 50 },
  },
  // Pro packs
  { type: 'eq_visualizer', label: 'EQ Visualizer', category: 'audio', description: 'Reactive equalizer bars', icon: '▐', duration: 5, animations: { enter: ['grow', 'fade'], exit: ['fade'] }, defaults: { brandColor: '#3B82F6', accentColor: '#22D3EE', bars: 20, seed: 4 }, position: { xPct: 50, yPct: 78 } },
  { type: 'circular_waveform', label: 'Circular Wave', category: 'audio', description: 'Circular audio ring', icon: '◎', duration: 4, animations: { enter: ['reveal', 'fade'], exit: ['fade'] }, defaults: { brandColor: '#3B82F6', accentColor: '#FFD600' }, position: { xPct: 50, yPct: 50 } },
  { type: 'social_frame', label: 'Social Frame', category: 'social', description: '9:16 social safe-frame', icon: '▢', duration: 8, animations: { enter: ['fade'], exit: ['fade'] }, defaults: { platform: 'tiktok', label: 'TIKTOK', brandColor: '#FFFFFF' }, position: { xPct: 50, yPct: 50 } },
  { type: 'broadcast_lower_third', label: 'Broadcast L3', category: 'lower_thirds', description: 'Broadcast nameplate', icon: '▬', duration: 4, animations: { enter: ['slide_left', 'spring_in'], exit: ['fade'] }, defaults: { title: 'Host Name', subtitle: 'Show title', brandColor: '#E11D48' }, position: { xPct: 20, yPct: 86 } },
  { type: 'subscribe_badge', label: 'Subscribe', category: 'cta', description: 'Subscribe / follow badge', icon: '▶', duration: 3, animations: { enter: ['pop_pulse', 'spring_in'], exit: ['fade'] }, defaults: { text: 'Subscribe', platform: 'youtube', brandColor: '#FF0000' }, position: { xPct: 50, yPct: 82 } },
  { type: 'device_mockup', label: 'Device Mockup', category: 'product', description: 'Phone / tablet / laptop frame', icon: '📱', duration: 4, animations: { enter: ['spring_in', 'fade'], exit: ['fade'] }, defaults: { device: 'phone', title: 'App', brandColor: '#3B82F6', accentColor: '#FFFFFF' }, position: { xPct: 50, yPct: 48 } },
  { type: 'kinetic_line', label: 'Kinetic Lines', category: 'typography', description: 'Line-by-line kinetic text', icon: '≡', duration: 4, animations: { enter: ['slide_up', 'spring_in'], exit: ['fade'] }, defaults: { text: 'Bold features | Fast benefits | Clear value', color: '#FFFFFF', accentColor: '#FFD600', fontSize: 48 }, position: { xPct: 50, yPct: 42 } },
  { type: 'glass_card', label: 'Glass Card', category: 'ui', description: 'Frosted glass card', icon: '▭', duration: 4, animations: { enter: ['fade_up', 'spring_in'], exit: ['fade'] }, defaults: { title: 'Insight', subtitle: 'Premium detail', brandColor: '#3B82F6' }, position: { xPct: 50, yPct: 48 } },
  { type: 'liquid_blob', label: 'Liquid Blob', category: 'effects', description: 'Organic morphing blob', icon: '●', duration: 5, animations: { enter: ['reveal', 'fade'], exit: ['fade'] }, defaults: { colorA: '#8B5CF6', colorB: '#3B82F6' }, position: { xPct: 50, yPct: 50 } },
  { type: 'callout_line', label: 'Call-Out Line', category: 'callouts', description: 'Line pointing to a feature', icon: '↳', duration: 3, animations: { enter: ['draw', 'spring_in'], exit: ['fade'] }, defaults: { text: 'Tap here', angle: -25, brandColor: '#FFD600' }, position: { xPct: 60, yPct: 45 } },
  { type: 'pie_chart', label: 'Pie Chart', category: 'data', description: 'Animated pie / donut', icon: '◔', duration: 4, animations: { enter: ['grow', 'spring_in'], exit: ['fade'] }, defaults: { title: 'Share', labels: ['A', 'B', 'C'], values: [40, 35, 25], brandColor: '#3B82F6', accentColor: '#FFD600' }, position: { xPct: 50, yPct: 48 } },
  { type: 'funnel_chart', label: 'Funnel Chart', category: 'data', description: 'Funnel stages', icon: '▽', duration: 4, animations: { enter: ['grow', 'spring_in'], exit: ['fade'] }, defaults: { labels: ['Awareness', 'Interest', 'Convert'], values: [100, 60, 30], brandColor: '#3B82F6', accentColor: '#FFD600' }, position: { xPct: 50, yPct: 48 } },
  { type: 'corporate_timeline', label: 'Corp Timeline', category: 'consultancy', description: 'Vertical roadmap timeline', icon: '⋮', duration: 5, animations: { enter: ['grow', 'spring_in'], exit: ['fade'] }, defaults: { title: 'Roadmap', steps: ['2022', '2023', '2024', '2025'], brandColor: '#3B82F6', accentColor: '#FFD600' }, position: { xPct: 40, yPct: 48 } },
  { type: 'parallax_slide', label: 'Parallax Slide', category: 'ui', description: 'Minimalist parallax text', icon: '—', duration: 4, animations: { enter: ['fade_up', 'fade'], exit: ['fade'] }, defaults: { title: 'Elegant', subtitle: 'Minimal movement', brandColor: '#FFFFFF' }, position: { xPct: 50, yPct: 45 } },
  { type: 'icon_pop', label: 'Icon Pop', category: 'ui', description: 'Animated business icon', icon: '★', duration: 3, animations: { enter: ['pop', 'spring_in'], exit: ['fade'] }, defaults: { label: '★', title: 'Feature', brandColor: '#3B82F6' }, position: { xPct: 50, yPct: 45 } },
  { type: 'whip_transition', label: 'Whip Transition', category: 'transitions', description: 'Camera whip transition', icon: '≫', duration: 0.8, animations: { enter: ['wipe'], exit: ['wipe'] }, defaults: { color: '#0F172A', accentColor: '#FFFFFF' }, position: { xPct: 50, yPct: 50 } },
  { type: 'zoom_transition', label: 'Zoom Transition', category: 'transitions', description: 'Punch-zoom transition', icon: '◎', duration: 0.8, animations: { enter: ['reveal'], exit: ['fade'] }, defaults: { color: '#000000' }, position: { xPct: 50, yPct: 50 } },
  { type: 'split_screen', label: 'Split Screen', category: 'layouts', description: 'Two-panel layout', icon: '▥', duration: 5, animations: { enter: ['reveal', 'fade'], exit: ['fade'] }, defaults: { leftLabel: 'Before', rightLabel: 'After', brandColor: '#3B82F6', accentColor: '#FFD600' }, position: { xPct: 50, yPct: 50 } },
  { type: 'grid_layout', label: 'Grid Layout', category: 'layouts', description: '2×2 grid frames', icon: '▦', duration: 5, animations: { enter: ['fade'], exit: ['fade'] }, defaults: { brandColor: '#FFFFFF' }, position: { xPct: 50, yPct: 50 } },
  { type: 'glitch_overlay', label: 'Glitch Overlay', category: 'effects', description: 'Urban glitch aesthetic', icon: '⚡', duration: 2, animations: { enter: ['burst', 'fade'], exit: ['fade'] }, defaults: { brandColor: '#22D3EE', accentColor: '#EF4444', intensity: 0.5 }, position: { xPct: 50, yPct: 50 } },
  { type: 'paper_rip', label: 'Paper Rip', category: 'effects', description: 'Tactile paper-rip edge', icon: '∿', duration: 3, animations: { enter: ['reveal', 'fade'], exit: ['fade'] }, defaults: { color: '#F8FAFC', side: 'bottom' }, position: { xPct: 50, yPct: 50 } },
  { type: 'collage_frame', label: 'Collage Frame', category: 'effects', description: 'Mixed-media collage', icon: '⧉', duration: 4, animations: { enter: ['spring_in', 'fade'], exit: ['fade'] }, defaults: { title: 'COLLAGE', brandColor: '#3B82F6', accentColor: '#FFD600' }, position: { xPct: 50, yPct: 48 } },
  { type: 'karaoke_caption', label: 'Karaoke Caption', category: 'typography', description: 'Word-highlight captions', icon: '♪', duration: 4, animations: { enter: ['word_pop', 'fade'], exit: ['fade'] }, defaults: { text: 'Every word hits different', color: '#FFFFFF', accentColor: '#FFD600', fontSize: 42 }, position: { xPct: 50, yPct: 78 } },
  { type: 'doodle_scribble', label: 'Doodle Scribble', category: 'callouts', description: 'Sketch circle or arrow', icon: '✎', duration: 3, animations: { enter: ['draw', 'spring_in'], exit: ['fade'] }, defaults: { text: '', variant: 'circle', brandColor: '#FFD600' }, position: { xPct: 50, yPct: 50 } },
  { type: 'hud_grid', label: 'HUD Grid', category: 'effects', description: 'Digital HUD grid', icon: '#', duration: 6, animations: { enter: ['fade'], exit: ['fade'] }, defaults: { brandColor: '#22D3EE', intensity: 0.35 }, position: { xPct: 50, yPct: 50 } },
  { type: 'hud_loader', label: 'HUD Loader', category: 'effects', description: 'HUD loading ring', icon: '◌', duration: 3, animations: { enter: ['grow', 'fade'], exit: ['fade'] }, defaults: { label: 'LOADING', brandColor: '#22D3EE' }, position: { xPct: 50, yPct: 50 } },
  { type: 'geometric_pattern', label: 'Geometric Pattern', category: 'effects', description: 'Animated geometric backdrop', icon: '◈', duration: 8, animations: { enter: ['fade'], exit: ['fade'] }, defaults: { colorA: '#1E3A5F', colorB: '#3B82F6', intensity: 0.4 }, position: { xPct: 50, yPct: 50 } },
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

const DEFAULT_SPRING = { damping: 14, stiffness: 180, mass: 1 }

/** Build clip effects for inserting a pro motion graphic at playhead. */
export function buildMotionGraphicClipEffects(
  type: string,
  brandColor = '#3B82F6',
  overrides?: {
    motionProps?: Record<string, unknown>
    position?: { xPct: number; yPct: number }
    animation?: {
      enter?: string
      exit?: string
      enterDuration?: number
      exitDuration?: number
      spring?: { damping?: number; stiffness?: number; mass?: number }
    }
  },
): Record<string, unknown> {
  const def = getMotionGraphicDef(type)
  if (!def) return { visualType: type }

  const motionProps = { ...def.defaults, ...(overrides?.motionProps ?? {}) }
  if ('brandColor' in motionProps || type.includes('third') || type === 'end_card') {
    if (!overrides?.motionProps?.brandColor) {
      motionProps.brandColor = brandColor
    }
  }

  const anim = overrides?.animation
  const pos = overrides?.position ?? def.position

  return {
    visualType: type,
    xPct: pos.xPct,
    yPct: pos.yPct,
    motionEnter: anim?.enter ?? def.animations.enter[0],
    motionExit: anim?.exit ?? def.animations.exit[0],
    motionEnterDuration: anim?.enterDuration ?? 0.5,
    motionExitDuration: anim?.exitDuration ?? 0.35,
    motionSpring: { ...DEFAULT_SPRING, ...(anim?.spring ?? {}) },
    motionAnimation: {
      enter: anim?.enter ?? def.animations.enter[0],
      exit: anim?.exit ?? def.animations.exit[0],
      enterDuration: anim?.enterDuration ?? 0.5,
      exitDuration: anim?.exitDuration ?? 0.35,
      spring: { ...DEFAULT_SPRING, ...(anim?.spring ?? {}) },
    },
    motionProps,
    displayValue: String(motionProps.text ?? motionProps.title ?? motionProps.label ?? ''),
    secondaryText: String(
      motionProps.subtitle ?? motionProps.label ?? motionProps.author ?? motionProps.sublabel ?? '',
    ),
    brandColor: String(motionProps.brandColor ?? brandColor),
  }
}

export interface MotionPlanElement {
  id?: string
  type: string
  startSeconds: number
  endSeconds: number
  position?: { xPct: number; yPct: number }
  animation?: {
    enter?: string
    exit?: string
    enterDuration?: number
    exitDuration?: number
    spring?: { damping?: number; stiffness?: number; mass?: number }
  }
  props?: Record<string, unknown>
}

export interface MotionPlanLike {
  elements: MotionPlanElement[]
}

/** Convert a validated motion plan into timeline overlay clip payloads. */
export function motionPlanToClipPayloads(
  plan: MotionPlanLike,
  brandColor = '#3B82F6',
): Array<{
  id: string
  startTime: number
  duration: number
  label: string
  effects: Record<string, unknown>
}> {
  return (plan.elements ?? [])
    .filter((el) => isMotionGraphicProType(el.type))
    .map((el, i) => {
      const start = Math.max(0, Number(el.startSeconds) || 0)
      const end = Math.max(start + 0.3, Number(el.endSeconds) || start + 2)
      const def = getMotionGraphicDef(el.type)
      const effects = buildMotionGraphicClipEffects(el.type, brandColor, {
        motionProps: el.props,
        position: el.position,
        animation: el.animation,
      })
      return {
        id: String(el.id || `mg-plan-${Date.now().toString(36)}-${i}`),
        startTime: start,
        duration: end - start,
        label: def?.label ?? el.type,
        effects,
      }
    })
}
