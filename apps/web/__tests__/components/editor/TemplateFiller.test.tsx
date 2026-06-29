/**
 * Tests for TemplateFiller component (Module 02).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TemplateFiller } from '@/components/editor/TemplateFiller'

describe('TemplateFiller', () => {
  const template = {
    layers: [
      {
        type: 'video_placeholder',
        slot: 'clip_1',
        label: 'Hook clip',
        start: 0,
        end: 5,
      },
      {
        type: 'text_overlay',
        slot: 'hook',
        label: 'Opening text',
        start: 0,
        end: 3,
      },
    ],
  }

  it('renders video and text slots', () => {
    render(<TemplateFiller template={template} onFill={vi.fn()} />)
    expect(screen.getByText('Hook clip')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter hook…')).toBeInTheDocument()
  })

  it('calls onFill when text changes', () => {
    const onFill = vi.fn()
    render(<TemplateFiller template={template} onFill={onFill} />)
    fireEvent.change(screen.getByPlaceholderText('Enter hook…'), {
      target: { value: 'Hello' },
    })
    expect(onFill).toHaveBeenCalledWith('hook', 'Hello')
  })
})
