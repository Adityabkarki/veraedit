/**
 * Tests for stores/producerStore.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  useProducerStore,
  initialProducerState,
  MOCK_SHOW_NOTES,
  MOCK_CHAPTERS,
  MOCK_QUOTES,
  MOCK_SOCIAL_POSTS,
  MOCK_NEWSLETTER,
} from '@/stores/producerStore'

beforeEach(() => {
  useProducerStore.setState({
    ...initialProducerState,
    status: { ...initialProducerState.status },
  })
})

// ── Initial state ─────────────────────────────────────────────────────────────

describe('producerStore — initial state', () => {
  it('language defaults to en', () => {
    expect(useProducerStore.getState().language).toBe('en')
  })
  it('all sections start idle', () => {
    const { status } = useProducerStore.getState()
    expect(status.showNotes).toBe('idle')
    expect(status.chapters).toBe('idle')
    expect(status.quotes).toBe('idle')
    expect(status.social).toBe('idle')
    expect(status.newsletter).toBe('idle')
  })
  it('no results before generation', () => {
    const s = useProducerStore.getState()
    expect(s.showNotes).toBeNull()
    expect(s.chapters).toBeNull()
    expect(s.quotes).toBeNull()
    expect(s.socialPosts).toBeNull()
    expect(s.newsletter).toBeNull()
  })
  it('activePlatform defaults to twitter', () => {
    expect(useProducerStore.getState().activePlatform).toBe('twitter')
  })
})

// ── Mock data validation ──────────────────────────────────────────────────────

describe('producerStore — mock data bilingual coverage', () => {
  it('show notes summary has both languages', () => {
    expect(MOCK_SHOW_NOTES.summary.en.length).toBeGreaterThan(0)
    expect(MOCK_SHOW_NOTES.summary.ne.length).toBeGreaterThan(0)
  })
  it('show notes topics all have Nepali', () => {
    MOCK_SHOW_NOTES.topics.forEach((t) => {
      expect(t.ne.length).toBeGreaterThan(0)
    })
  })
  it('chapters all have Nepali titles', () => {
    MOCK_CHAPTERS.forEach((c) => {
      expect(c.title.ne.length).toBeGreaterThan(0)
    })
  })
  it('chapters are ordered by startTime', () => {
    for (let i = 0; i < MOCK_CHAPTERS.length - 1; i++) {
      expect(MOCK_CHAPTERS[i].startTime).toBeLessThan(MOCK_CHAPTERS[i + 1].startTime)
    }
  })
  it('has 5 key quotes', () => {
    expect(MOCK_QUOTES.length).toBe(5)
  })
  it('quotes all have Nepali text', () => {
    MOCK_QUOTES.forEach((q) => {
      expect(q.text.ne.length).toBeGreaterThan(0)
    })
  })
  it('has all 4 social platforms', () => {
    const platforms = MOCK_SOCIAL_POSTS.map((p) => p.platform)
    expect(platforms).toContain('twitter')
    expect(platforms).toContain('linkedin')
    expect(platforms).toContain('facebook')
    expect(platforms).toContain('instagram')
  })
  it('all social posts have hashtags', () => {
    MOCK_SOCIAL_POSTS.forEach((p) => {
      expect(p.hashtags.length).toBeGreaterThan(0)
    })
  })
  it('newsletter has both languages', () => {
    expect(MOCK_NEWSLETTER.en.length).toBeGreaterThan(0)
    expect(MOCK_NEWSLETTER.ne.length).toBeGreaterThan(0)
  })
})

// ── Language toggle ───────────────────────────────────────────────────────────

describe('producerStore — language', () => {
  it('setLanguage switches to ne', () => {
    useProducerStore.getState().setLanguage('ne')
    expect(useProducerStore.getState().language).toBe('ne')
  })
  it('setLanguage switches back to en', () => {
    useProducerStore.getState().setLanguage('ne')
    useProducerStore.getState().setLanguage('en')
    expect(useProducerStore.getState().language).toBe('en')
  })
})

// ── Generation flow ───────────────────────────────────────────────────────────

describe('producerStore — generate / complete', () => {
  it('generateSection sets status to generating', () => {
    useProducerStore.getState().generateSection('showNotes')
    expect(useProducerStore.getState().status.showNotes).toBe('generating')
  })
  it('completeSection sets status to done', () => {
    useProducerStore.getState().generateSection('showNotes')
    useProducerStore.getState().completeSection('showNotes')
    expect(useProducerStore.getState().status.showNotes).toBe('done')
  })
  it('completeSection fills show notes result', () => {
    useProducerStore.getState().completeSection('showNotes')
    expect(useProducerStore.getState().showNotes).toEqual(MOCK_SHOW_NOTES)
  })
  it('completeSection fills chapters result', () => {
    useProducerStore.getState().completeSection('chapters')
    expect(useProducerStore.getState().chapters).toEqual(MOCK_CHAPTERS)
  })
  it('completeSection fills quotes result', () => {
    useProducerStore.getState().completeSection('quotes')
    expect(useProducerStore.getState().quotes).toEqual(MOCK_QUOTES)
  })
  it('completeSection fills social posts result', () => {
    useProducerStore.getState().completeSection('social')
    expect(useProducerStore.getState().socialPosts).toEqual(MOCK_SOCIAL_POSTS)
  })
  it('completeSection fills newsletter result', () => {
    useProducerStore.getState().completeSection('newsletter')
    expect(useProducerStore.getState().newsletter).toEqual(MOCK_NEWSLETTER)
  })
  it('generateNow sets done and fills result in one call', () => {
    useProducerStore.getState().generateNow('quotes')
    expect(useProducerStore.getState().status.quotes).toBe('done')
    expect(useProducerStore.getState().quotes).toEqual(MOCK_QUOTES)
  })
  it('generating one section does not affect others', () => {
    useProducerStore.getState().generateSection('showNotes')
    expect(useProducerStore.getState().status.chapters).toBe('idle')
  })
})

// ── Platform tab ──────────────────────────────────────────────────────────────

describe('producerStore — social platform', () => {
  it('setActivePlatform changes the platform', () => {
    useProducerStore.getState().setActivePlatform('linkedin')
    expect(useProducerStore.getState().activePlatform).toBe('linkedin')
  })
})

// ── Reset ─────────────────────────────────────────────────────────────────────

describe('producerStore — resetProducer', () => {
  it('resets all sections to idle', () => {
    useProducerStore.getState().generateNow('showNotes')
    useProducerStore.getState().generateNow('chapters')
    useProducerStore.getState().resetProducer()
    const { status } = useProducerStore.getState()
    expect(status.showNotes).toBe('idle')
    expect(status.chapters).toBe('idle')
  })
  it('clears all results', () => {
    useProducerStore.getState().generateNow('quotes')
    useProducerStore.getState().resetProducer()
    expect(useProducerStore.getState().quotes).toBeNull()
  })
})
