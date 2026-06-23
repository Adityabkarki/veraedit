/**
 * Onboarding Store
 *
 * Persists the user's 5-step onboarding progress.
 * Once completed=true, the wizard never shows again unless reset().
 *
 * Preferences stored here influence AI behaviour (content language, type)
 * and initial editor style (brandStyle).
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ContentLanguage = 'nepali' | 'english' | 'mixed'
export type ContentType = 'podcast' | 'tutorial' | 'vlog' | 'shorts' | 'mixed'
export type BrandStyle = 'bold' | 'minimal' | 'warm' | 'professional'
export type ComingFrom =
  | 'descript'
  | 'opus_clip'
  | 'capcut'
  | 'veed'
  | 'canva'
  | 'riverside'
  | 'other'

interface OnboardingState {
  completed: boolean
  currentStep: number // 1-5
  contentLanguage: ContentLanguage
  contentType: ContentType
  brandStyle: BrandStyle
  comingFrom: ComingFrom | null

  nextStep: () => void
  prevStep: () => void
  setContentLanguage: (lang: ContentLanguage) => void
  setContentType: (type: ContentType) => void
  setBrandStyle: (style: BrandStyle) => void
  setComingFrom: (tool: ComingFrom) => void
  complete: () => void
  reset: () => void
}

export const initialOnboardingState = {
  completed: false,
  currentStep: 1,
  contentLanguage: 'nepali' as ContentLanguage,
  contentType: 'mixed' as ContentType,
  brandStyle: 'bold' as BrandStyle,
  comingFrom: null as ComingFrom | null,
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      ...initialOnboardingState,

      nextStep: () =>
        set((s) => ({ currentStep: Math.min(s.currentStep + 1, 5) })),
      prevStep: () =>
        set((s) => ({ currentStep: Math.max(s.currentStep - 1, 1) })),

      setContentLanguage: (lang) => set({ contentLanguage: lang }),
      setContentType: (type) => set({ contentType: type }),
      setBrandStyle: (style) => set({ brandStyle: style }),
      setComingFrom: (tool) => set({ comingFrom: tool }),

      complete: () => set({ completed: true }),
      reset: () => set({ ...initialOnboardingState }),
    }),
    { name: 'viraedit-onboarding' }
  )
)
