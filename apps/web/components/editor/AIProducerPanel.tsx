'use client'

/**
 * AIProducerPanel — Riverside-style AI Producer (EP-4.12).
 *
 * Shown in the right panel when uiStore.rightPanelMode === 'producer'.
 * Generates podcast production assets from the transcript, each in
 * English OR Nepali (toggle).
 *
 * Sections:
 *   📝 Show Notes   — summary, key topics, resources, guest info
 *   📑 Chapters     — topic-shift chapters with timestamps (click → seek)
 *   💬 Key Quotes   — pull-quote cards (click → seek, copy)
 *   📣 Social Posts — Twitter / LinkedIn / Facebook / Instagram with hashtags
 *   📧 Newsletter   — 2–3 paragraph blurb
 */

import { useCallback } from 'react'
import { useProducerStore } from '@/stores/producerStore'
import type { Bilingual, SocialPlatform } from '@/stores/producerStore'
import { usePlayerStore }   from '@/stores/playerStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { useUIStore }       from '@/stores/uiStore'
import { ProducerSection }  from '@/components/editor/producer/ProducerSection'

const PLATFORM_META: Record<SocialPlatform, { label: string; icon: string }> = {
  twitter:   { label: 'Twitter/X', icon: '𝕏' },
  linkedin:  { label: 'LinkedIn',  icon: 'in' },
  facebook:  { label: 'Facebook',  icon: 'f' },
  instagram: { label: 'Instagram', icon: '◎' },
}

function formatTime(s: number): string {
  const m  = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

export function AIProducerPanel() {
  const {
    language, status, showNotes, chapters, quotes, socialPosts, newsletter,
    activePlatform, setLanguage, setActivePlatform,
  } = useProducerStore()

  const { seek }            = usePlayerStore()
  const { setPlayheadTime } = useTimelineStore()
  const { setRightPanelMode } = useUIStore()

  // Language-aware text accessor
  const t = useCallback((b: Bilingual) => b[language], [language])

  const seekTo = useCallback((time: number) => {
    seek(time)
    setPlayheadTime(time)
  }, [seek, setPlayheadTime])

  const copy = useCallback((text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {})
    }
  }, [])

  const activePost = socialPosts?.find((p) => p.platform === activePlatform)

  return (
    <div
      data-testid="ai-producer-panel"
      className="flex flex-col h-full min-h-0 bg-bg-surface border-l border-bg-overlay overflow-hidden"
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-bg-overlay flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-accent" aria-hidden="true">
            <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.25"/>
            <circle cx="7.5" cy="7.5" r="2" fill="currentColor"/>
          </svg>
          <h2 className="text-sm font-semibold text-text-primary">AI Producer</h2>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Language toggle */}
          <div
            data-testid="producer-language-toggle"
            className="flex rounded-lg overflow-hidden border border-bg-overlay"
          >
            <button
              data-testid="producer-lang-en"
              onClick={() => setLanguage('en')}
              aria-pressed={language === 'en'}
              className={[
                'px-2 py-0.5 text-[10px] font-medium transition-colors',
                language === 'en' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary',
              ].join(' ')}
            >
              EN
            </button>
            <button
              data-testid="producer-lang-ne"
              onClick={() => setLanguage('ne')}
              aria-pressed={language === 'ne'}
              className={[
                'px-2 py-0.5 text-[10px] font-medium transition-colors',
                language === 'ne' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary',
              ].join(' ')}
            >
              🇳🇵
            </button>
          </div>

          {/* Back to AI */}
          <button
            data-testid="producer-back-to-ai"
            onClick={() => setRightPanelMode('ai')}
            title="Back to AI Suggestions"
            className="text-[11px] text-accent hover:text-accent-glow transition-colors px-1"
          >
            ← AI
          </button>
        </div>
      </div>

      {/* ── Scrollable sections ──────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain">

        {/* ── Show Notes ─────────────────────────────────────────────────── */}
        <ProducerSection sectionKey="showNotes" title="Show Notes" icon="📝">
          {showNotes && (
            <div className="space-y-3 text-xs">
              <div>
                <p className="text-text-disabled mb-1 font-medium">Summary</p>
                <p className={`text-text-secondary leading-relaxed ${language === 'ne' ? 'font-nepali' : ''}`}>
                  {t(showNotes.summary)}
                </p>
              </div>
              <div>
                <p className="text-text-disabled mb-1 font-medium">Key topics</p>
                <ul className="space-y-0.5">
                  {showNotes.topics.map((topic, i) => (
                    <li key={i} className={`text-text-secondary flex gap-1.5 ${language === 'ne' ? 'font-nepali' : ''}`}>
                      <span className="text-accent">•</span> {t(topic)}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-text-disabled mb-1 font-medium">Resources</p>
                <ul className="space-y-0.5">
                  {showNotes.resources.map((r, i) => (
                    <li key={i} className="text-text-secondary flex gap-1.5">
                      <span className="text-status-info">→</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                data-testid="copy-show-notes"
                onClick={() => copy(t(showNotes.summary))}
                className="text-[11px] text-accent hover:text-accent-glow transition-colors"
              >
                Copy summary
              </button>
            </div>
          )}
        </ProducerSection>

        {/* ── Chapters ───────────────────────────────────────────────────── */}
        <ProducerSection sectionKey="chapters" title="Chapters" icon="📑">
          {chapters && (
            <div className="space-y-1">
              {chapters.map((ch) => (
                <button
                  key={ch.id}
                  data-testid={`chapter-${ch.id}`}
                  onClick={() => seekTo(ch.startTime)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg
                             hover:bg-bg-overlay transition-colors text-left group"
                >
                  <span className="text-[10px] font-mono text-accent flex-shrink-0 w-10">
                    {formatTime(ch.startTime)}
                  </span>
                  <span className={`flex-1 text-xs text-text-secondary group-hover:text-text-primary ${language === 'ne' ? 'font-nepali' : ''}`}>
                    {t(ch.title)}
                  </span>
                </button>
              ))}
              <button
                data-testid="copy-chapters"
                onClick={() => copy(chapters.map((c) => `${formatTime(c.startTime)} ${t(c.title)}`).join('\n'))}
                className="text-[11px] text-accent hover:text-accent-glow transition-colors mt-1"
              >
                Copy as YouTube chapters
              </button>
            </div>
          )}
        </ProducerSection>

        {/* ── Key Quotes ─────────────────────────────────────────────────── */}
        <ProducerSection sectionKey="quotes" title="Key Quotes" icon="💬">
          {quotes && (
            <div className="space-y-2">
              {quotes.map((q) => (
                <div
                  key={q.id}
                  data-testid={`quote-${q.id}`}
                  className="p-2.5 rounded-lg bg-bg-elevated border border-bg-overlay"
                >
                  <p className={`text-xs text-text-secondary italic leading-snug mb-1.5 ${language === 'ne' ? 'font-nepali' : ''}`}>
                    “{t(q.text)}”
                  </p>
                  <div className="flex items-center justify-between">
                    <button
                      data-testid={`quote-seek-${q.id}`}
                      onClick={() => seekTo(q.startTime)}
                      className="text-[10px] font-mono text-text-disabled hover:text-accent transition-colors"
                    >
                      Speaker {q.speaker} · {formatTime(q.startTime)}
                    </button>
                    <button
                      data-testid={`quote-copy-${q.id}`}
                      onClick={() => copy(t(q.text))}
                      className="text-[10px] text-accent hover:text-accent-glow transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ProducerSection>

        {/* ── Social Posts ───────────────────────────────────────────────── */}
        <ProducerSection sectionKey="social" title="Social Posts" icon="📣">
          {socialPosts && (
            <div className="space-y-2">
              {/* Platform tabs */}
              <div
                role="tablist"
                aria-label="Social platform"
                className="flex gap-1"
              >
                {socialPosts.map((p) => (
                  <button
                    key={p.platform}
                    role="tab"
                    aria-selected={activePlatform === p.platform}
                    data-testid={`social-tab-${p.platform}`}
                    onClick={() => setActivePlatform(p.platform)}
                    className={[
                      'flex-1 py-1 rounded text-[10px] font-medium transition-colors',
                      activePlatform === p.platform
                        ? 'bg-accent text-white'
                        : 'bg-bg-overlay text-text-secondary hover:text-text-primary',
                    ].join(' ')}
                  >
                    {PLATFORM_META[p.platform].label}
                  </button>
                ))}
              </div>

              {/* Active post */}
              {activePost && (
                <div
                  data-testid={`social-post-${activePost.platform}`}
                  className="p-2.5 rounded-lg bg-bg-elevated border border-bg-overlay"
                >
                  <p className={`text-xs text-text-secondary leading-relaxed mb-2 ${language === 'ne' ? 'font-nepali' : ''}`}>
                    {t(activePost.text)}
                  </p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {activePost.hashtags.map((h) => (
                      <span key={h} className="text-[10px] text-status-info">{h}</span>
                    ))}
                  </div>
                  <button
                    data-testid={`social-copy-${activePost.platform}`}
                    onClick={() => copy(`${t(activePost.text)}\n\n${activePost.hashtags.join(' ')}`)}
                    className="text-[11px] text-accent hover:text-accent-glow transition-colors"
                  >
                    Copy post
                  </button>
                </div>
              )}
            </div>
          )}
        </ProducerSection>

        {/* ── Newsletter ─────────────────────────────────────────────────── */}
        <ProducerSection sectionKey="newsletter" title="Newsletter" icon="📧">
          {newsletter && (
            <div className="space-y-2">
              <p className={`text-xs text-text-secondary leading-relaxed whitespace-pre-line ${language === 'ne' ? 'font-nepali' : ''}`}>
                {t(newsletter)}
              </p>
              <button
                data-testid="copy-newsletter"
                onClick={() => copy(t(newsletter))}
                className="text-[11px] text-accent hover:text-accent-glow transition-colors"
              >
                Copy blurb
              </button>
            </div>
          )}
        </ProducerSection>
      </div>
    </div>
  )
}
