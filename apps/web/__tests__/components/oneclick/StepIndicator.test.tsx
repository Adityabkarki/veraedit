/**
 * Tests for components/oneclick/StepIndicator.tsx
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { StepIndicator } from '@/components/oneclick/StepIndicator'

describe('StepIndicator', () => {
  it('renders four progress dots without labels', () => {
    const { container } = render(<StepIndicator current="resolve" />)
    const dots = container.querySelectorAll('[data-testid="step-indicator"] > div')
    expect(dots).toHaveLength(4)
    expect(container.textContent).toBe('')
  })

  it('highlights dots through the current step', () => {
    const { container, rerender } = render(<StepIndicator current="reference" />)
    let dots = container.querySelectorAll('[data-testid="step-indicator"] > div')
    expect(dots[0]?.className).toContain('bg-accent')
    expect(dots[1]?.className).not.toContain('bg-accent')

    rerender(<StepIndicator current="done" />)
    dots = container.querySelectorAll('[data-testid="step-indicator"] > div')
    expect(dots[3]?.className).toContain('bg-accent')
  })
})
