import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AIToolsSection } from '@/components/editor/properties/sections/AIToolsSection'

const removeBackgroundFromImageClipMock = vi.fn()

vi.mock('@/lib/imageMedia', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/imageMedia')>()
  return {
    ...actual,
    removeBackgroundFromImageClip: (...args: unknown[]) =>
      removeBackgroundFromImageClipMock(...args),
  }
})

beforeEach(() => {
  removeBackgroundFromImageClipMock.mockReset()
  removeBackgroundFromImageClipMock.mockResolvedValue(undefined)
})

describe('AIToolsSection — remove background', () => {
  it('disables remove background when no image is loaded', () => {
    render(
      <AIToolsSection
        clipId="img-1"
        imageSrc=""
        storageKey=""
        projectId="proj-1"
        onJobStarted={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /AI tools/i }))
    expect(screen.getByTestId('image-ai-remove-background')).toBeDisabled()
  })

  it('runs client-side background removal when clicked', async () => {
    render(
      <AIToolsSection
        clipId="img-1"
        imageSrc="blob:http://localhost/photo"
        storageKey=""
        projectId="proj-1"
        onJobStarted={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /AI tools/i }))
    fireEvent.click(screen.getByTestId('image-ai-remove-background'))

    await waitFor(() => {
      expect(removeBackgroundFromImageClipMock).toHaveBeenCalledWith(
        'img-1',
        expect.any(Function),
      )
    })
  })
})
