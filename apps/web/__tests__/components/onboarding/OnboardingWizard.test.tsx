/**
 * Tests for components/onboarding/OnboardingWizard.tsx
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import { useOnboardingStore, initialOnboardingState } from '@/stores/onboardingStore'

beforeEach(() => {
  useOnboardingStore.setState({ ...initialOnboardingState })
  localStorage.clear()
})

// ── Step 1: Welcome ───────────────────────────────────────────────────────────

describe('OnboardingWizard — step 1 (welcome)', () => {
  it('renders the welcome heading', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    expect(screen.getByText(/Welcome to ViraEdit/i)).toBeInTheDocument()
  })

  it('renders the Get Started button', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Get Started/i })).toBeInTheDocument()
  })

  it('pressing Get Started advances to step 2', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Get Started/i }))
    expect(useOnboardingStore.getState().currentStep).toBe(2)
    expect(screen.getByText(/What language are your videos in/i)).toBeInTheDocument()
  })

  it('shows step counter "Step 1 of 5"', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    expect(screen.getByText(/Step 1 of 5/i)).toBeInTheDocument()
  })
})

// ── Step 2: Content language ──────────────────────────────────────────────────

describe('OnboardingWizard — step 2 (content language)', () => {
  beforeEach(() => {
    useOnboardingStore.setState({ ...initialOnboardingState, currentStep: 2 })
  })

  it('shows the content language question', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    expect(screen.getByText(/What language are your videos in/i)).toBeInTheDocument()
  })

  it('Nepali is pre-selected by default', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    const nepaliBtn = screen.getByTestId('lang-nepali')
    expect(nepaliBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('English is not selected initially', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    const englishBtn = screen.getByTestId('lang-english')
    expect(englishBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking English selects English', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    fireEvent.click(screen.getByTestId('lang-english'))
    expect(useOnboardingStore.getState().contentLanguage).toBe('english')
  })

  it('clicking Back returns to step 1', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Back/i }))
    expect(useOnboardingStore.getState().currentStep).toBe(1)
  })

  it('Continue advances to step 3', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    expect(useOnboardingStore.getState().currentStep).toBe(3)
  })
})

// ── Step 3: Content type ──────────────────────────────────────────────────────

describe('OnboardingWizard — step 3 (content type)', () => {
  beforeEach(() => {
    useOnboardingStore.setState({ ...initialOnboardingState, currentStep: 3 })
  })

  it('shows the content type question', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    expect(screen.getByText(/What kind of videos do you make/i)).toBeInTheDocument()
  })

  it('clicking Podcast selects podcast', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    fireEvent.click(screen.getByTestId('content-type-podcast'))
    expect(useOnboardingStore.getState().contentType).toBe('podcast')
  })

  it('clicking Tutorial selects tutorial', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    fireEvent.click(screen.getByTestId('content-type-tutorial'))
    expect(useOnboardingStore.getState().contentType).toBe('tutorial')
  })

  it('default mixed type is pre-selected', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    expect(screen.getByTestId('content-type-mixed')).toHaveAttribute('aria-pressed', 'true')
  })
})

// ── Step 4: Brand style ───────────────────────────────────────────────────────

describe('OnboardingWizard — step 4 (brand style)', () => {
  beforeEach(() => {
    useOnboardingStore.setState({ ...initialOnboardingState, currentStep: 4 })
  })

  it('shows the brand style heading', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    expect(screen.getByText(/Choose a starting style/i)).toBeInTheDocument()
  })

  it('bold style is pre-selected', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    expect(screen.getByTestId('brand-style-bold')).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking Minimal selects minimal', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    fireEvent.click(screen.getByTestId('brand-style-minimal'))
    expect(useOnboardingStore.getState().brandStyle).toBe('minimal')
  })
})

// ── Step 5: First upload ──────────────────────────────────────────────────────

describe('OnboardingWizard — step 5 (first upload)', () => {
  beforeEach(() => {
    useOnboardingStore.setState({ ...initialOnboardingState, currentStep: 5 })
  })

  it('shows the completion heading', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    expect(screen.getByText(/You're all set/i)).toBeInTheDocument()
  })

  it('shows the capability checklist', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    expect(screen.getByText(/Transcribe your video in Nepali/i)).toBeInTheDocument()
    expect(screen.getByText(/Generate viral shorts/i)).toBeInTheDocument()
  })

  it('Upload First Video calls complete() and onUpload()', () => {
    const onComplete = vi.fn()
    const onUpload = vi.fn()
    render(<OnboardingWizard onComplete={onComplete} onUpload={onUpload} />)
    fireEvent.click(screen.getByRole('button', { name: /Upload First Video/i }))
    expect(useOnboardingStore.getState().completed).toBe(true)
    expect(onComplete).toHaveBeenCalledOnce()
    expect(onUpload).toHaveBeenCalledOnce()
  })

  it('Use Sample Video calls complete() without onUpload', () => {
    const onComplete = vi.fn()
    const onUpload = vi.fn()
    render(<OnboardingWizard onComplete={onComplete} onUpload={onUpload} />)
    fireEvent.click(screen.getByRole('button', { name: /Use Sample Video/i }))
    expect(useOnboardingStore.getState().completed).toBe(true)
    expect(onComplete).toHaveBeenCalledOnce()
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('"Skip for now" calls complete() and closes wizard', () => {
    const onComplete = vi.fn()
    render(<OnboardingWizard onComplete={onComplete} onUpload={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Skip for now/i }))
    expect(useOnboardingStore.getState().completed).toBe(true)
    expect(onComplete).toHaveBeenCalledOnce()
  })
})

// ── Accessibility ─────────────────────────────────────────────────────────────

describe('OnboardingWizard — accessibility', () => {
  it('has dialog role with aria-modal', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onUpload={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })
})
