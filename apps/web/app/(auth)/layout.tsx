import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'Sign in',
    template: '%s — ViraEdit',
  },
}

/**
 * Auth layout — centered card on a dark background.
 * No sidebar, no header. Simple and focused.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base px-4">
      {/* Subtle gradient background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(196,30,58,0.08) 0%, transparent 70%)',
        }}
        aria-hidden
      />
      <main className="relative w-full max-w-sm">{children}</main>
    </div>
  )
}
