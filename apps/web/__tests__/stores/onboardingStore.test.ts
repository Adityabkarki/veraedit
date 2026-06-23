/**
 * Tests for stores/onboardingStore.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useOnboardingStore, initialOnboardingState } from '@/stores/onboardingStore'

beforeEach(() => {
  useOnboardingStore.setState({ ...initialOnboardingState })
  localStorage.clear()
})

// ── Initial state ─────────────────────────────────────────────────────────────

describe('onboardingStore — initial state', () => {
  it('completed defaults to false', () => {
    expect(useOnboardingStore.getState().completed).toBe(false)
  })

  it('currentStep defaults to 1', () => {
    expect(useOnboardingStore.getState().currentStep).toBe(1)
  })

  it('contentLanguage defaults to nepali', () => {
    expect(useOnboardingStore.getState().contentLanguage).toBe('nepali')
  })

  it('contentType defaults to mixed', () => {
    expect(useOnboardingStore.getState().contentType).toBe('mixed')
  })

  it('brandStyle defaults to bold', () => {
    expect(useOnboardingStore.getState().brandStyle).toBe('bold')
  })

  it('comingFrom defaults to null', () => {
    expect(useOnboardingStore.getState().comingFrom).toBeNull()
  })
})

// ── Step navigation ───────────────────────────────────────────────────────────

describe('onboardingStore — step navigation', () => {
  it('nextStep increments currentStep', () => {
    useOnboardingStore.getState().nextStep()
    expect(useOnboardingStore.getState().currentStep).toBe(2)
  })

  it('nextStep does not exceed step 5', () => {
    useOnboardingStore.setState({ currentStep: 5 })
    useOnboardingStore.getState().nextStep()
    expect(useOnboardingStore.getState().currentStep).toBe(5)
  })

  it('prevStep decrements currentStep', () => {
    useOnboardingStore.setState({ currentStep: 3 })
    useOnboardingStore.getState().prevStep()
    expect(useOnboardingStore.getState().currentStep).toBe(2)
  })

  it('prevStep does not go below step 1', () => {
    useOnboardingStore.getState().prevStep()
    expect(useOnboardingStore.getState().currentStep).toBe(1)
  })

  it('can progress from step 1 to step 5', () => {
    for (let i = 0; i < 4; i++) useOnboardingStore.getState().nextStep()
    expect(useOnboardingStore.getState().currentStep).toBe(5)
  })
})

// ── Preference setters ────────────────────────────────────────────────────────

describe('onboardingStore — preferences', () => {
  it('setContentLanguage updates contentLanguage', () => {
    useOnboardingStore.getState().setContentLanguage('english')
    expect(useOnboardingStore.getState().contentLanguage).toBe('english')
  })

  it('setContentLanguage accepts mixed', () => {
    useOnboardingStore.getState().setContentLanguage('mixed')
    expect(useOnboardingStore.getState().contentLanguage).toBe('mixed')
  })

  it('setContentType updates contentType', () => {
    useOnboardingStore.getState().setContentType('podcast')
    expect(useOnboardingStore.getState().contentType).toBe('podcast')
  })

  it('setContentType accepts all types', () => {
    for (const type of ['podcast', 'tutorial', 'vlog', 'shorts', 'mixed'] as const) {
      useOnboardingStore.getState().setContentType(type)
      expect(useOnboardingStore.getState().contentType).toBe(type)
    }
  })

  it('setBrandStyle updates brandStyle', () => {
    useOnboardingStore.getState().setBrandStyle('minimal')
    expect(useOnboardingStore.getState().brandStyle).toBe('minimal')
  })

  it('setComingFrom updates comingFrom', () => {
    useOnboardingStore.getState().setComingFrom('descript')
    expect(useOnboardingStore.getState().comingFrom).toBe('descript')
  })

  it('setComingFrom can be set to opus_clip', () => {
    useOnboardingStore.getState().setComingFrom('opus_clip')
    expect(useOnboardingStore.getState().comingFrom).toBe('opus_clip')
  })
})

// ── Complete and reset ────────────────────────────────────────────────────────

describe('onboardingStore — complete and reset', () => {
  it('complete sets completed to true', () => {
    useOnboardingStore.getState().complete()
    expect(useOnboardingStore.getState().completed).toBe(true)
  })

  it('complete does not change currentStep', () => {
    useOnboardingStore.setState({ currentStep: 3 })
    useOnboardingStore.getState().complete()
    expect(useOnboardingStore.getState().currentStep).toBe(3)
  })

  it('reset returns to initial state', () => {
    useOnboardingStore.setState({
      completed: true,
      currentStep: 5,
      contentLanguage: 'english',
      brandStyle: 'professional',
      comingFrom: 'capcut',
    })
    useOnboardingStore.getState().reset()
    const s = useOnboardingStore.getState()
    expect(s.completed).toBe(false)
    expect(s.currentStep).toBe(1)
    expect(s.contentLanguage).toBe('nepali')
    expect(s.brandStyle).toBe('bold')
    expect(s.comingFrom).toBeNull()
  })

  it('reset then complete works correctly', () => {
    useOnboardingStore.getState().complete()
    useOnboardingStore.getState().reset()
    expect(useOnboardingStore.getState().completed).toBe(false)
  })
})
