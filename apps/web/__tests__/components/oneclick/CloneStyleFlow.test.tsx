/**
 * Tests for components/oneclick/CloneStyleFlow.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CloneStyleFlow } from '@/components/oneclick/CloneStyleFlow'

const matchTemplateToLibrary = vi.fn()
const startRenderFromTemplate = vi.fn()

vi.mock('@/lib/gapResolutionApi', () => ({
  matchTemplateToLibrary: (...args: unknown[]) => matchTemplateToLibrary(...args),
}))

vi.mock('@/lib/renderTemplateApi', () => ({
  startRenderFromTemplate: (...args: unknown[]) => startRenderFromTemplate(...args),
  getTemplateRenderJob: vi.fn(),
}))

vi.mock('@/hooks/useJobPoller', () => ({
  useJobPoller: () => ({ status: 'idle', result: null, error: null }),
}))

vi.mock('@/components/editor/ReferenceInput', () => ({
  ReferenceInput: ({
    onTemplateReady,
  }: {
    onTemplateReady: (t: unknown) => void
  }) => (
    <button
      type="button"
      data-testid="mock-reference-ready"
      onClick={() =>
        onTemplateReady({
          version: '2.1',
          duration: 10,
          aspect_ratio: '9:16',
          slots: [],
        })
      }
    >
      Mock analyze
    </button>
  ),
}))

const ANNOTATED_TEMPLATE = {
  version: '2.1',
  duration: 10,
  aspect_ratio: '9:16',
  pacing: 'medium' as const,
  visual_style: 'ugc',
  color_palette: [],
  caption_style: {},
  audio_profile: {
    music_genre: 'none',
    music_energy_arc: 'none',
    has_sfx_hits: false,
    music_ducking_behavior: 'no music',
    voice_emotion_arc: 'moderate',
  },
  director_notes: [],
  slots: [
    {
      slot_id: 'clip_1',
      type: 'video_placeholder',
      label: 'Hook',
      start: 0,
      end: 3,
      requirement: { description: 'Talking head' },
      match: {
        status: 'matched',
        asset_id: 'a1',
        score: 1,
        storage_key: 'library/hook.mp4',
      },
    },
  ],
  transitions: [],
}

describe('CloneStyleFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    matchTemplateToLibrary.mockResolvedValue({ data: ANNOTATED_TEMPLATE, error: null })
    startRenderFromTemplate.mockResolvedValue({ data: { job_id: 'job-1' }, error: null })
  })

  it('starts on reference step and advances to resolve after template match', async () => {
    render(<CloneStyleFlow projectId="proj-1" />)

    fireEvent.click(screen.getByTestId('mock-reference-ready'))

    await waitFor(() => {
      expect(matchTemplateToLibrary).toHaveBeenCalled()
      expect(screen.getByTestId('template-gap-resolver')).toBeInTheDocument()
    })
  })

  it('disables continue until all media slots are resolved', async () => {
    matchTemplateToLibrary.mockResolvedValue({
      data: {
        ...ANNOTATED_TEMPLATE,
        slots: [
          {
            ...ANNOTATED_TEMPLATE.slots[0],
            match: { status: 'missing', asset_id: null, score: 0, storage_key: null },
          },
        ],
      },
      error: null,
    })

    render(<CloneStyleFlow projectId="proj-1" />)
    fireEvent.click(screen.getByTestId('mock-reference-ready'))

    await waitFor(() => {
      expect(screen.getByTestId('clone-style-continue-btn')).toBeDisabled()
    })
  })

  it('queues render when continuing with all slots resolved and no text overlays', async () => {
    render(<CloneStyleFlow projectId="proj-1" />)
    fireEvent.click(screen.getByTestId('mock-reference-ready'))

    await waitFor(() => {
      expect(screen.getByTestId('clone-style-continue-btn')).not.toBeDisabled()
    })

    fireEvent.click(screen.getByTestId('clone-style-continue-btn'))

    await waitFor(() => {
      expect(startRenderFromTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          resolvedAssets: expect.objectContaining({
            clip_1: expect.objectContaining({ storageKey: 'library/hook.mp4' }),
          }),
        }),
      )
      expect(screen.getByText('Putting your video together...')).toBeInTheDocument()
    })
  })
})
