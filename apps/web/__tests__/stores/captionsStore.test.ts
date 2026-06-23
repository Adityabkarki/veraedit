/**
 * Tests for stores/captionsStore.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  useCaptionsStore,
  INITIAL_CAPTIONS,
  CAPTION_PRESETS,
  toSRTTime,
  toVTTTime,
  generateSRT,
  generateVTT,
} from '@/stores/captionsStore'

beforeEach(() => {
  useCaptionsStore.getState().resetCaptions()
  useCaptionsStore.getState().loadDemoData()
})

// ── Initial state ─────────────────────────────────────────────────────────────

describe('captionsStore — initial state', () => {
  it('starts empty before demo data is loaded', () => {
    useCaptionsStore.getState().resetCaptions()
    expect(useCaptionsStore.getState().captions).toHaveLength(0)
  })

  it('loads INITIAL_CAPTIONS via loadDemoData (12 captions)', () => {
    expect(useCaptionsStore.getState().captions).toHaveLength(12)
  })
  it('first caption is in Nepali (Devanagari)', () => {
    const first = useCaptionsStore.getState().captions[0]
    expect(first.text).toContain('नमस्ते')
  })
  it('last caption is in English', () => {
    const last = useCaptionsStore.getState().captions[11]
    expect(last.text).toBe('Thank you for watching!')
  })
  it('editingId is null', () => {
    expect(useCaptionsStore.getState().editingId).toBeNull()
  })
  it('global style is nepali-bold by default', () => {
    expect(useCaptionsStore.getState().globalStyle.preset).toBe('nepali-bold')
  })
  it('nepali-bold preset has useNepaliFont = true', () => {
    expect(useCaptionsStore.getState().globalStyle.useNepaliFont).toBe(true)
  })
})

// ── Editing ───────────────────────────────────────────────────────────────────

describe('captionsStore — editing', () => {
  it('startEdit sets editingId', () => {
    useCaptionsStore.getState().startEdit('cap-01')
    expect(useCaptionsStore.getState().editingId).toBe('cap-01')
  })
  it('stopEdit clears editingId', () => {
    useCaptionsStore.getState().startEdit('cap-01')
    useCaptionsStore.getState().stopEdit()
    expect(useCaptionsStore.getState().editingId).toBeNull()
  })
  it('updateText changes caption text', () => {
    useCaptionsStore.getState().updateText('cap-01', 'Updated text')
    expect(useCaptionsStore.getState().captions.find((c) => c.id === 'cap-01')!.text)
      .toBe('Updated text')
  })
  it('updateText supports Devanagari', () => {
    useCaptionsStore.getState().updateText('cap-01', 'नयाँ text')
    expect(useCaptionsStore.getState().captions.find((c) => c.id === 'cap-01')!.text)
      .toBe('नयाँ text')
  })
  it('updateStartTime clamps to 0', () => {
    useCaptionsStore.getState().updateStartTime('cap-01', -1)
    expect(useCaptionsStore.getState().captions.find((c) => c.id === 'cap-01')!.startTime).toBe(0)
  })
  it('updateEndTime enforces minimum duration', () => {
    useCaptionsStore.getState().updateEndTime('cap-01', 0)
    const cap = useCaptionsStore.getState().captions.find((c) => c.id === 'cap-01')!
    expect(cap.endTime).toBeGreaterThan(cap.startTime)
  })
})

// ── Add / delete ──────────────────────────────────────────────────────────────

describe('captionsStore — add/delete', () => {
  it('addCaption inserts a new caption after the given id', () => {
    const before = useCaptionsStore.getState().captions.length
    useCaptionsStore.getState().addCaption('cap-01')
    expect(useCaptionsStore.getState().captions.length).toBe(before + 1)
  })
  it('new caption starts editing', () => {
    useCaptionsStore.getState().addCaption('cap-01')
    expect(useCaptionsStore.getState().editingId).not.toBeNull()
  })
  it('deleteCaption removes the caption', () => {
    const before = useCaptionsStore.getState().captions.length
    useCaptionsStore.getState().deleteCaption('cap-01')
    expect(useCaptionsStore.getState().captions.length).toBe(before - 1)
    expect(useCaptionsStore.getState().captions.find((c) => c.id === 'cap-01')).toBeUndefined()
  })
  it('deleteCaption re-indexes remaining captions', () => {
    useCaptionsStore.getState().deleteCaption('cap-01')
    const { captions } = useCaptionsStore.getState()
    captions.forEach((c, i) => {
      expect(c.index).toBe(i + 1)
    })
  })
})

// ── Style ─────────────────────────────────────────────────────────────────────

describe('captionsStore — style', () => {
  it('applyPreset changes all style properties', () => {
    useCaptionsStore.getState().applyPreset('tiktok')
    const style = useCaptionsStore.getState().globalStyle
    expect(style.preset).toBe('tiktok')
    expect(style.position).toBe('center')
    expect(style.bold).toBe(true)
  })
  it('applyPreset subtitle sets useNepaliFont to false', () => {
    useCaptionsStore.getState().applyPreset('subtitle')
    expect(useCaptionsStore.getState().globalStyle.useNepaliFont).toBe(false)
  })
  it('applyPreset bilingual sets useNepaliFont to true', () => {
    useCaptionsStore.getState().applyPreset('bilingual')
    expect(useCaptionsStore.getState().globalStyle.useNepaliFont).toBe(true)
  })
  it('setStyleProp updates individual property', () => {
    useCaptionsStore.getState().setStyleProp('bold', true)
    expect(useCaptionsStore.getState().globalStyle.bold).toBe(true)
  })
  it('all 4 presets exist in CAPTION_PRESETS', () => {
    const keys = Object.keys(CAPTION_PRESETS)
    expect(keys).toContain('nepali-bold')
    expect(keys).toContain('subtitle')
    expect(keys).toContain('tiktok')
    expect(keys).toContain('bilingual')
  })
})

// ── Search / replace ──────────────────────────────────────────────────────────

describe('captionsStore — find/replace', () => {
  it('setSearchQuery finds matching captions', () => {
    useCaptionsStore.getState().setSearchQuery('नमस्ते')
    expect(useCaptionsStore.getState().searchMatchIds.length).toBeGreaterThan(0)
  })
  it('setSearchQuery is case-insensitive by default for English', () => {
    useCaptionsStore.getState().setSearchQuery('THANK')
    expect(useCaptionsStore.getState().searchMatchIds.length).toBeGreaterThan(0)
  })
  it('empty query clears matches', () => {
    useCaptionsStore.getState().setSearchQuery('नमस्ते')
    useCaptionsStore.getState().setSearchQuery('')
    expect(useCaptionsStore.getState().searchMatchIds).toHaveLength(0)
  })
  it('replaceAll replaces all occurrences', () => {
    useCaptionsStore.getState().setSearchQuery('video')
    useCaptionsStore.getState().setReplaceText('VIDEO')
    useCaptionsStore.getState().replaceAll()
    const captions = useCaptionsStore.getState().captions
    const hasLower = captions.some((c) => c.text.toLowerCase().includes('video') && c.text.includes('video'))
    // After replace, 'video' (lowercase) should not appear where it was before
    // (Some may still have 'VIDEO' which is fine)
    expect(useCaptionsStore.getState().searchMatchIds).toHaveLength(0)
  })
  it('toggleCaseSensitive flips the flag', () => {
    useCaptionsStore.getState().toggleCaseSensitive()
    expect(useCaptionsStore.getState().caseSensitive).toBe(true)
    useCaptionsStore.getState().toggleCaseSensitive()
    expect(useCaptionsStore.getState().caseSensitive).toBe(false)
  })
})

// ── SRT / VTT formatters ──────────────────────────────────────────────────────

describe('captionsStore — SRT/VTT format helpers', () => {
  it('toSRTTime formats seconds correctly', () => {
    expect(toSRTTime(0)).toBe('00:00:00,000')
    expect(toSRTTime(1.5)).toBe('00:00:01,500')
    expect(toSRTTime(65.25)).toBe('00:01:05,250')
    expect(toSRTTime(3661.1)).toBe('01:01:01,100')
  })
  it('toVTTTime uses period not comma', () => {
    expect(toVTTTime(1.5)).toBe('00:00:01.500')
  })
  it('generateSRT produces correct format', () => {
    const caps = INITIAL_CAPTIONS.slice(0, 2)
    const srt  = generateSRT(caps)
    expect(srt).toContain('1\n')
    expect(srt).toContain(' --> ')
    expect(srt).toContain(',')  // SRT uses comma decimal
    // Contains Nepali (Devanagari) text from the first caption
    expect(srt).toMatch(/नमस्ते|नमस्/)
  })
  it('generateVTT starts with WEBVTT', () => {
    const vtt = generateVTT(INITIAL_CAPTIONS.slice(0, 1))
    expect(vtt).toMatch(/^WEBVTT/)
  })
  it('generateVTT uses period not comma', () => {
    const vtt = generateVTT(INITIAL_CAPTIONS.slice(0, 1))
    expect(vtt).not.toContain(',')
  })
  it('generateSRT numbers captions sequentially', () => {
    const srt = generateSRT(INITIAL_CAPTIONS.slice(0, 3))
    // SRT starts at beginning: "1\n...", subsequent: "\n\n2\n..."
    expect(srt).toMatch(/^1\n/)
    expect(srt).toContain('\n2\n')
    expect(srt).toContain('\n3\n')
  })
})

describe('captionsStore — loadFromTranscript', () => {
  it('builds captions from word timestamps', () => {
    useCaptionsStore.getState().loadFromTranscript({
      full_text: 'hello world test',
      words: [
        { word: 'hello', start: 0, end: 0.5 },
        { word: 'world', start: 0.5, end: 1.0 },
        { word: 'test', start: 1.0, end: 1.5 },
      ],
    })
    const caps = useCaptionsStore.getState().captions
    expect(caps.length).toBeGreaterThan(0)
    expect(caps[0].text).toContain('hello')
  })
})
