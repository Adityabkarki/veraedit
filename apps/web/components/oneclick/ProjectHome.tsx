'use client'

import Link from 'next/link'
import { AISpendBadge } from '@/components/shared/AISpendBadge'

const ACTIONS = [
  {
    href: 'clone-style',
    icon: '🎨',
    title: 'Clone a style I like',
    description:
      'Paste a TikTok, Reel, or YouTube link — we match its style with your footage',
  },
  {
    href: 'shorts',
    icon: '✂️',
    title: 'Get shorts for social media',
    description: 'Upload your long video, get clips ready for TikTok, Instagram, YouTube',
  },
  {
    href: 'chapters',
    icon: '📑',
    title: 'Split into chapters',
    description: 'Break your podcast or recording into separate topic clips',
  },
  {
    href: 'trailer',
    icon: '🎬',
    title: 'Make a highlight trailer',
    description: 'A fast-cut preview of your best moments',
  },
] as const

export function ProjectHome({ projectId }: { projectId: string }) {
  return (
    <div className="min-h-screen bg-bg-base">
      <header className="border-b border-bg-overlay px-4 py-3 flex items-center justify-between gap-3">
        <Link href="/dashboard" className="text-xs text-accent hover:underline">
          ← Dashboard
        </Link>
        <AISpendBadge projectId={projectId} />
      </header>

      <div className="max-w-2xl mx-auto py-16 px-4" data-testid="project-home">
        <h1 className="text-2xl font-semibold text-center text-text-primary mb-2">
          What do you want to make?
        </h1>
        <p className="text-sm text-text-secondary text-center mb-10">
          Pick one — we&apos;ll handle the rest
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={`/projects/${projectId}/${action.href}`}
              data-testid={`project-action-${action.href}`}
              className="border-2 border-bg-overlay rounded-2xl p-6 hover:border-accent/50 hover:bg-accent/5 transition-all"
            >
              <span className="text-3xl mb-3 block" aria-hidden>
                {action.icon}
              </span>
              <h3 className="font-semibold text-sm mb-1 text-text-primary">{action.title}</h3>
              <p className="text-xs text-text-secondary">{action.description}</p>
            </Link>
          ))}
        </div>

        <p className="text-center mt-10">
          <Link href={`/editor/${projectId}`} className="text-xs text-accent hover:underline">
            Open full editor instead
          </Link>
        </p>
      </div>
    </div>
  )
}
