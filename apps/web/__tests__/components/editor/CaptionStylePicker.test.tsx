/**
 * Tests for CaptionStylePicker (Module 03).
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CaptionStylePicker } from '@/components/editor/CaptionStylePicker'
import { useCaptionsStore } from '@/stores/captionsStore'

vi.mock('@/lib/captionsApi', () => ({
  BURN_IN_STYLES: [
    { id: 'hormozi', label: 'Hormozi', description: 'Bold' },
    { id: 'mrbeast', label: 'MrBeast', description: 'Yellow' },
    { id: 'minimal', label: 'Minimal', description: 'Clean' },
    { id: 'nepali_bold', label: 'Nepali Bold', description: 'Devanagari' },
    { id: 'kinetic', label: 'Kinetic', description: 'Orange' },
  ],
  startCaptionRender: vi.fn(),
  getCaptionJob: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
  },
}))

describe('CaptionStylePicker', () => {
  beforeEach(() => {
    useCaptionsStore.getState().loadDemoData()
  })

  it('renders five burn-in style buttons', () => {
    render(<CaptionStylePicker projectId="proj-1" />)
    expect(screen.getByTestId('caption-style-picker')).toBeInTheDocument()
    expect(screen.getByTestId('burn-style-hormozi')).toBeInTheDocument()
    expect(screen.getByTestId('burn-style-mrbeast')).toBeInTheDocument()
    expect(screen.getByTestId('burn-style-minimal')).toBeInTheDocument()
    expect(screen.getByTestId('burn-style-nepali_bold')).toBeInTheDocument()
    expect(screen.getByTestId('burn-style-kinetic')).toBeInTheDocument()
  })

  it('selects a style when clicked', () => {
    render(<CaptionStylePicker projectId="proj-1" />)
    const btn = screen.getByTestId('burn-style-hormozi')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows burn captions button', () => {
    render(<CaptionStylePicker projectId="proj-1" />)
    expect(screen.getByTestId('burn-captions-btn')).toHaveTextContent(
      'Burn captions into video'
    )
  })
})
