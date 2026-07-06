/**
 * Tests for DirectorAutoEditPanel and DirectorCompiledBanner
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DirectorAutoEditPanel } from '@/components/editor/director/DirectorAutoEditPanel'
import { DirectorCompiledBanner } from '@/components/editor/director/DirectorCompiledBanner'
import { useDirectorStore } from '@/stores/directorStore'
import { useUIStore, initialUIState } from '@/stores/uiStore'
import type { DirectorTimeline } from '@/types/director'

const mockTimeline: DirectorTimeline = {
  schemaVersion: 1,
  projectId: 'proj-1',
  contentType: 'podcast',
  fps: 30,
  durationInFrames: 900,
  width: 1920,
  height: 1080,
  theme: {},
  tracks: {
    video: [],
    audio: [],
    captions: [],
    broll: [],
    motionGraphics: [
      {
        id: 'entry-1',
        componentId: 'SpeakerCard',
        startFrame: 0,
        durationInFrames: 90,
        layerDepth: 1,
        props: {},
        triggerId: 'trig-1',
      },
    ],
    transitions: [],
    vfx: [],
    sfx: [],
    multicam: [],
  },
  triggers: [
    {
      id: 'trig-1',
      type: 'speaker_change',
      transcriptStart: 1.2,
      transcriptEnd: 4.5,
      confidence: 0.82,
      status: 'realized',
      resultingEntryId: 'entry-1',
      confidenceSource: 'heuristic',
    },
  ],
}

beforeEach(() => {
  useDirectorStore.getState().reset()
  useUIStore.setState({ ...initialUIState })
})

describe('DirectorAutoEditPanel', () => {
  it('shows enable panel when Director Engine is off', () => {
    render(<DirectorAutoEditPanel projectId="proj-1" />)
    expect(screen.getByTestId('director-enable-panel')).toBeInTheDocument()
    expect(screen.getByTestId('director-enable-button')).toHaveTextContent('Enable Auto Edit')
  })

  it('shows pillar buttons when Director Engine is on', () => {
    useDirectorStore.setState({ useDirectorEngine: true })
    render(<DirectorAutoEditPanel projectId="proj-1" />)
    expect(screen.getByTestId('director-auto-edit-panel')).toBeInTheDocument()
    expect(screen.getByTestId('auto-edit-podcast')).toBeInTheDocument()
    expect(screen.getByTestId('auto-edit-social')).toBeInTheDocument()
  })

  it('lists realized triggers with delete control', () => {
    useDirectorStore.setState({
      useDirectorEngine: true,
      timeline: mockTimeline,
      version: 1,
    })
    render(<DirectorAutoEditPanel projectId="proj-1" />)
    expect(screen.getByTestId('trigger-log-trig-1')).toBeInTheDocument()
    expect(screen.getByTestId('delete-trigger-trig-1')).toBeInTheDocument()
  })
})

describe('DirectorCompiledBanner', () => {
  it('is hidden without a compiled timeline', () => {
    useDirectorStore.setState({ useDirectorEngine: true })
    const { container } = render(<DirectorCompiledBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows banner after compile with review link', () => {
    useDirectorStore.setState({
      useDirectorEngine: true,
      timeline: mockTimeline,
      version: 2,
      lastCompileLabel: 'podcast',
    })
    render(<DirectorCompiledBanner />)
    expect(screen.getByTestId('director-compiled-banner')).toBeInTheDocument()
    expect(screen.getByTestId('director-open-log')).toHaveTextContent('Review triggers')
  })
})
