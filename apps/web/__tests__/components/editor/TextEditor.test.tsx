/**
 * Tests for TextEditor component (Module 04).
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TextEditor, mergeCuts } from '@/components/editor/TextEditor'

const WORDS = [
  { word: 'Hello', start: 0, end: 0.5 },
  { word: 'world', start: 0.5, end: 1.0 },
  { word: 'test', start: 1.0, end: 1.5 },
]

describe('mergeCuts', () => {
  it('merges overlapping ranges', () => {
    const merged = mergeCuts([
      { start: 0, end: 1 },
      { start: 0.9, end: 2 },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].end).toBe(2)
  })
})

describe('TextEditor', () => {
  it('renders words', () => {
    render(
      <TextEditor
        words={WORDS}
        currentTime={0}
        onSeek={vi.fn()}
        onApply={vi.fn()}
      />
    )
    expect(screen.getByTestId('text-editor')).toBeInTheDocument()
    expect(screen.getByTestId('text-word-0')).toHaveTextContent('Hello')
  })

  it('shows filler and silence toggles', () => {
    render(
      <TextEditor
        words={WORDS}
        currentTime={0}
        fillerCuts={[{ start: 0, end: 0.5, reason: 'filler' }]}
        silenceCuts={[{ start: 2, end: 3, reason: 'silence' }]}
        onSeek={vi.fn()}
        onApply={vi.fn()}
      />
    )
    expect(screen.getByTestId('toggle-fillers')).toHaveTextContent('Fillers (1)')
    expect(screen.getByTestId('toggle-silences')).toHaveTextContent('Silences (1)')
  })

  it('calls onSeek when word clicked', () => {
    const onSeek = vi.fn()
    render(
      <TextEditor words={WORDS} currentTime={0} onSeek={onSeek} onApply={vi.fn()} />
    )
    fireEvent.click(screen.getByTestId('text-word-0'))
    expect(onSeek).toHaveBeenCalledWith(0)
  })

  it('shows empty state when no words', () => {
    render(
      <TextEditor words={[]} currentTime={0} onSeek={vi.fn()} onApply={vi.fn()} />
    )
    expect(screen.getByText(/No transcript words yet/)).toBeInTheDocument()
  })
})
