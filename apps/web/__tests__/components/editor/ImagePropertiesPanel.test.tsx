import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImagePropertiesPanel } from '@/components/editor/properties/ImagePropertiesPanel'
import { useTimelineStore } from '@/stores/timelineStore'
import { initialUIState, useUIStore } from '@/stores/uiStore'

beforeEach(() => {
  useTimelineStore.getState().resetTimeline()
  useUIStore.setState({ ...initialUIState })
})

function seedImageClip() {
  useTimelineStore.setState({
    clips: [
      {
        id: 'img-test',
        trackId: 'images',
        startTime: 1,
        duration: 5,
        label: 'Test image',
        type: 'overlay',
        effects: {
          visualType: 'image_slot',
          mediaUrl: 'https://example.com/test.jpg',
          mediaKind: 'image',
          xPct: 50,
          yPct: 50,
          widthPct: 40,
          heightPct: 40,
        },
      },
    ],
    selectedClipIds: ['img-test'],
  })
}

describe('ImagePropertiesPanel', () => {
  it('shows empty state when no image is selected', () => {
    render(<ImagePropertiesPanel projectId="proj-1" />)
    expect(screen.getByTestId('image-properties-empty')).toBeInTheDocument()
    expect(screen.getByText('Select an image to edit')).toBeInTheDocument()
  })

  it('renders all property sections for a selected image', () => {
    seedImageClip()
    render(<ImagePropertiesPanel projectId="proj-1" />)
    expect(screen.getByTestId('image-properties-panel')).toBeInTheDocument()
    expect(screen.getByText('Transform')).toBeInTheDocument()
    expect(screen.getByText('Timing on timeline')).toBeInTheDocument()
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.getByText('Blend mode')).toBeInTheDocument()
    expect(screen.getByText('Filters & color grading')).toBeInTheDocument()
    expect(screen.getByText('Border & shadow')).toBeInTheDocument()
    expect(screen.getByText('Animation')).toBeInTheDocument()
    expect(screen.getByText('Crop & mask')).toBeInTheDocument()
    expect(screen.getByText('AI tools')).toBeInTheDocument()
    expect(screen.getByTestId('image-remove-layer')).toBeInTheDocument()
  })

  it('updates transform when width changes', () => {
    seedImageClip()
    render(<ImagePropertiesPanel projectId="proj-1" />)

    const widthInput = screen.getByTestId('image-transform-width')
    fireEvent.change(widthInput, { target: { value: '60' } })

    const clip = useTimelineStore.getState().clips[0]
    expect(clip.effects?.widthPct).toBe(60)
  })
})
