import type { Metadata } from 'next'
import { Inter, Plus_Jakarta_Sans, Noto_Sans_Devanagari } from 'next/font/google'
import { Toaster } from 'sonner'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { ChunkLoadRecovery } from '@/components/providers/ChunkLoadRecovery'
import './globals.css'

// ── Fonts ─────────────────────────────────────────────────────────────────────

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
})

// Loaded only for video caption rendering — NOT applied to any UI element.
const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  variable: '--font-nepali',
  display: 'swap',
  weight: ['400', '700'],
})

// ── Metadata ──────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    default: 'ViraEdit',
    template: '%s — ViraEdit',
  },
  description: 'AI-native video editor built for Nepali content creators.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.svg',
  },
}

// ── Root Layout ───────────────────────────────────────────────────────────────

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${jakartaSans.variable} ${notoDevanagari.variable}`}
      suppressHydrationWarning
    >
      <body className="font-body bg-bg-base text-text-primary min-h-screen">
        <ChunkLoadRecovery />
        <QueryProvider>
          {children}
        </QueryProvider>
        {/* Toast notifications — uses friendly plain-language messages */}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--bg-elevated)',
              border: '1px solid var(--bg-overlay)',
              color: 'var(--text-primary)',
            },
          }}
        />
      </body>
    </html>
  )
}
