/**
 * AI Producer Store — Zustand
 *
 * Powers the Riverside-style AI Producer Panel (EP-4.12).
 *
 * Generates podcast production assets from the transcript:
 *   – Show Notes   (summary, key topics, resources, guest info)
 *   – Chapters     (topic-shift detection with timestamps)
 *   – Key Quotes   (5–10 quotable pull-quotes)
 *   – Social Posts (Twitter/X, LinkedIn, Facebook, Instagram)
 *   – Newsletter   (2–3 paragraph blurb)
 *
 * Each asset is available in English AND Nepali (toggle).
 *
 * Generation is mocked: `generateSection` flips status to 'generating',
 * `completeSection` flips it to 'done'. The UI inserts a short delay
 * between the two so the loading state is visible; tests call them
 * directly for deterministic assertions. Result data lives in the
 * MOCK_* constants and is language-aware via the `language` field.
 */

import { create } from 'zustand'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProducerSection  = 'showNotes' | 'chapters' | 'quotes' | 'social' | 'newsletter'
export type GenStatus        = 'idle' | 'generating' | 'done'
export type ProducerLanguage = 'en' | 'ne'
export type SocialPlatform   = 'twitter' | 'linkedin' | 'facebook' | 'instagram'

export interface Bilingual {
  en: string
  ne: string
}

export interface ShowNotes {
  summary:   Bilingual
  topics:    Bilingual[]
  resources: string[]
  guest:     Bilingual
}

export interface Chapter {
  id:        string
  title:     Bilingual
  startTime: number   // seconds
}

export interface KeyQuote {
  id:        string
  text:      Bilingual
  startTime: number   // seconds
  speaker:   string
}

export interface SocialPost {
  platform: SocialPlatform
  text:     Bilingual
  hashtags: string[]
}

// ── Mock generated content ────────────────────────────────────────────────────
// Based on the placeholder ViraEdit demo transcript (video-editing topic).

export const MOCK_SHOW_NOTES: ShowNotes = {
  summary: {
    en: 'In this episode we explore how AI-native video editing transforms the workflow for Nepali content creators — from automatic transcription to viral shorts.',
    ne: 'यो भागमा हामी कसरी AI-native video editing ले नेपाली content creators को कार्यप्रवाह बदल्छ भन्ने कुरा अन्वेषण गर्छौं — automatic transcription देखि viral shorts सम्म।',
  },
  topics: [
    { en: 'Automatic Nepali transcription with Whisper', ne: 'Whisper बाट automatic नेपाली transcription' },
    { en: 'Detecting silences and filler words',          ne: 'मौनता र filler words पहिचान' },
    { en: 'Generating viral shorts from long videos',      ne: 'लामो video बाट viral shorts बनाउने' },
    { en: 'Caption styling in Devanagari',                 ne: 'देवनागरीमा caption styling' },
  ],
  resources: [
    'ViraEdit documentation',
    'Noto Sans Devanagari font',
    'Groq Whisper API',
  ],
  guest: {
    en: 'Featuring a Kathmandu-based YouTuber sharing their editing journey.',
    ne: 'काठमाडौँका एक YouTuber ले आफ्नो editing यात्रा साझा गर्दै।',
  },
}

export const MOCK_CHAPTERS: Chapter[] = [
  { id: 'chap-1', startTime: 0,    title: { en: 'Introduction',           ne: 'परिचय' } },
  { id: 'chap-2', startTime: 72,   title: { en: 'The Editing Problem',    ne: 'Editing को समस्या' } },
  { id: 'chap-3', startTime: 270,  title: { en: 'AI Transcription',       ne: 'AI Transcription' } },
  { id: 'chap-4', startTime: 495,  title: { en: 'Creating Shorts',        ne: 'Shorts बनाउने' } },
  { id: 'chap-5', startTime: 1050, title: { en: 'Wrap-up & CTA',          ne: 'समापन र CTA' } },
]

export const MOCK_QUOTES: KeyQuote[] = [
  { id: 'q1', startTime: 78,   speaker: 'A', text: { en: 'AI understands Nepali speech better than ever before.', ne: 'AI ले नेपाली बोली पहिलेभन्दा राम्रोसँग बुझ्छ।' } },
  { id: 'q2', startTime: 285,  speaker: 'A', text: { en: 'The timeline updates automatically as you edit the transcript.', ne: 'तपाईंले transcript edit गर्दा timeline स्वतः update हुन्छ।' } },
  { id: 'q3', startTime: 510,  speaker: 'B', text: { en: 'One long video can become ten viral shorts.', ne: 'एउटा लामो video दस वटा viral shorts बन्न सक्छ।' } },
  { id: 'q4', startTime: 712,  speaker: 'A', text: { en: 'Captions render perfectly in Devanagari script.', ne: 'Captions देवनागरी लिपिमा पूर्ण रूपमा देखिन्छ।' } },
  { id: 'q5', startTime: 1062, speaker: 'A', text: { en: 'Editing should feel effortless for every creator.', ne: 'हरेक creator का लागि editing सहज हुनुपर्छ।' } },
]

export const MOCK_SOCIAL_POSTS: SocialPost[] = [
  {
    platform: 'twitter',
    text: {
      en: '🎬 New episode: How AI is changing video editing for Nepali creators. From auto-transcription to viral shorts — a full breakdown. 🧵',
      ne: '🎬 नयाँ भाग: AI ले नेपाली creators का लागि video editing कसरी बदल्दैछ। Auto-transcription देखि viral shorts सम्म। 🧵',
    },
    hashtags: ['#NepaliCreators', '#VideoEditing', '#AI'],
  },
  {
    platform: 'linkedin',
    text: {
      en: 'AI-native editing tools are levelling the playing field for content creators in Nepal. In our latest episode we break down the complete workflow.',
      ne: 'AI-native editing उपकरणहरूले नेपालमा content creators का लागि अवसर खोल्दैछन्। हाम्रो पछिल्लो भागमा सम्पूर्ण कार्यप्रवाह व्याख्या गरेका छौं।',
    },
    hashtags: ['#ContentCreation', '#Nepal', '#AItools'],
  },
  {
    platform: 'facebook',
    text: {
      en: 'Want to edit videos faster? Our new episode shows how AI handles Nepali transcription, captions, and shorts automatically. Watch now!',
      ne: 'छिटो video edit गर्न चाहनुहुन्छ? हाम्रो नयाँ भागले AI ले कसरी नेपाली transcription, captions र shorts स्वतः गर्छ देखाउँछ। अहिले हेर्नुहोस्!',
    },
    hashtags: ['#नेपाली', '#VideoEditing'],
  },
  {
    platform: 'instagram',
    text: {
      en: 'Edit smarter, not harder. 🎥✨ AI-powered video editing built for Nepali creators.',
      ne: 'स्मार्ट तरिकाले edit गर्नुहोस्। 🎥✨ नेपाली creators का लागि AI-powered video editing।',
    },
    hashtags: ['#reels', '#nepalicontent', '#editing', '#viral'],
  },
]

export const MOCK_NEWSLETTER: Bilingual = {
  en: 'This week we dive into AI-native video editing and what it means for Nepali content creators. We cover automatic transcription, silence detection, viral short generation, and Devanagari caption rendering — everything you need to produce professional videos faster.\n\nThe full episode walks through a real editing session step by step. Watch it to see how a single long-form video becomes a library of shareable shorts.',
  ne: 'यो हप्ता हामी AI-native video editing र यसले नेपाली content creators का लागि के अर्थ राख्छ भन्ने विषयमा प्रवेश गर्छौं। Automatic transcription, मौनता पहिचान, viral short निर्माण र देवनागरी caption rendering — व्यावसायिक video छिटो बनाउन चाहिने सबै कुरा समेटिएको छ।\n\nपूर्ण भागले वास्तविक editing session चरणबद्ध रूपमा देखाउँछ। एउटा लामो video कसरी share गर्न मिल्ने shorts को library बन्छ हेर्नुहोस्।',
}

// ── Store ─────────────────────────────────────────────────────────────────────

export interface ProducerState {
  language:        ProducerLanguage
  /** Generation status per section */
  status:          Record<ProducerSection, GenStatus>
  /** Whether each section's result has been generated yet */
  showNotes:       ShowNotes | null
  chapters:        Chapter[] | null
  quotes:          KeyQuote[] | null
  socialPosts:     SocialPost[] | null
  newsletter:      Bilingual | null
  /** Active social platform tab */
  activePlatform:  SocialPlatform

  setLanguage:      (lang: ProducerLanguage) => void
  setActivePlatform:(p: SocialPlatform) => void
  generateSection:  (section: ProducerSection) => void
  completeSection:  (section: ProducerSection) => void
  /** synchronous generate (sets generating + done + data) — convenience for tests */
  generateNow:      (section: ProducerSection) => void
  regenerate:       (section: ProducerSection) => void
  resetProducer:    () => void
}

export const initialProducerState = {
  language:       'en' as ProducerLanguage,
  status: {
    showNotes:  'idle',
    chapters:   'idle',
    quotes:     'idle',
    social:     'idle',
    newsletter: 'idle',
  } as Record<ProducerSection, GenStatus>,
  showNotes:      null as ShowNotes | null,
  chapters:       null as Chapter[] | null,
  quotes:         null as KeyQuote[] | null,
  socialPosts:    null as SocialPost[] | null,
  newsletter:     null as Bilingual | null,
  activePlatform: 'twitter' as SocialPlatform,
}

function fillResult(section: ProducerSection): Partial<ProducerState> {
  switch (section) {
    case 'showNotes':  return { showNotes:   MOCK_SHOW_NOTES }
    case 'chapters':   return { chapters:    MOCK_CHAPTERS }
    case 'quotes':     return { quotes:      MOCK_QUOTES }
    case 'social':     return { socialPosts: MOCK_SOCIAL_POSTS }
    case 'newsletter': return { newsletter:  MOCK_NEWSLETTER }
  }
}

export const useProducerStore = create<ProducerState>((set, get) => ({
  ...initialProducerState,

  setLanguage:       (lang) => set({ language: lang }),
  setActivePlatform: (p)    => set({ activePlatform: p }),

  generateSection: (section) =>
    set((s) => ({ status: { ...s.status, [section]: 'generating' } })),

  completeSection: (section) =>
    set((s) => ({
      status: { ...s.status, [section]: 'done' },
      ...fillResult(section),
    })),

  generateNow: (section) =>
    set((s) => ({
      status: { ...s.status, [section]: 'done' },
      ...fillResult(section),
    })),

  regenerate: (section) =>
    set((s) => ({ status: { ...s.status, [section]: 'generating' } })),

  resetProducer: () =>
    set({
      ...initialProducerState,
      status: { ...initialProducerState.status },
    }),
}))
