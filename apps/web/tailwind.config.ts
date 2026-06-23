import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './stores/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Background layers ──────────────────────────────────────────
        'bg-base':     '#0A0A0B',
        'bg-surface':  '#111113',
        'bg-elevated': '#1A1A1E',
        'bg-overlay':  '#242428',

        // ── Accent — Nepali flag crimson ───────────────────────────────
        accent: {
          DEFAULT: '#C41E3A',
          glow:    '#E8284A',
          muted:   '#3D0912',
        },

        // ── Text ───────────────────────────────────────────────────────
        'text-primary':   '#F2F2F3',
        'text-secondary': '#8B8B96',
        'text-disabled':  '#4A4A52',

        // ── Status ─────────────────────────────────────────────────────
        'status-success': '#22C55E',
        'status-warning': '#F59E0B',
        'status-error':   '#EF4444',
        'status-info':    '#3B82F6',

        // ── Timeline track colors ──────────────────────────────────────
        'track-video':    '#3B82F6',
        'track-audio':    '#8B5CF6',
        'track-captions': '#F59E0B',
        'track-music':    '#10B981',
        'track-overlay':  '#EC4899',
      },
      fontFamily: {
        display: ['var(--font-jakarta)', 'sans-serif'],
        body:    ['var(--font-inter)',   'sans-serif'],
        mono:    ['var(--font-mono)',    'monospace'],
        // Noto Sans Devanagari — only for video caption rendering, NOT UI
        nepali:  ['var(--font-nepali)', 'sans-serif'],
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':      'fadeIn 0.2s ease-in-out',
        'slide-up':     'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' },                    to: { opacity: '1' } },
        slideUp: { from: { transform: 'translateY(8px)', opacity: '0' },
                   to:   { transform: 'translateY(0)',   opacity: '1' } },
      },
    },
  },
  plugins: [],
}

export default config
