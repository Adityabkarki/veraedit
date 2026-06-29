/**
 * Tests for components/editor/LeftPanel.tsx
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LeftPanel } from '@/components/editor/LeftPanel'
import { useEditorStore } from '@/stores/editorStore'
import { resetEditorStores } from '@/__tests__/helpers/editorStoreReset'

beforeEach(() => {
  resetEditorStores()
})

describe('LeftPanel — structure', () => {
  it('renders the left panel', () => {
    render(<LeftPanel />)
    expect(screen.getByTestId('left-panel')).toBeInTheDocument()
  })

  it('renders all tab buttons', () => {
    render(<LeftPanel />)
    expect(screen.getByTestId('left-tab-media')).toBeInTheDocument()
    expect(screen.getByTestId('left-tab-transcript')).toBeInTheDocument()
    expect(screen.getByTestId('left-tab-brand')).toBeInTheDocument()
  })

  it('tab list has correct ARIA role', () => {
    render(<LeftPanel />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })
})

describe('LeftPanel — default tab', () => {
  it('media tab is selected by default', () => {
    render(<LeftPanel />)
    expect(screen.getByTestId('left-tab-media')).toHaveAttribute('aria-selected', 'true')
  })

  it('other tabs are not selected by default', () => {
    render(<LeftPanel />)
    expect(screen.getByTestId('left-tab-transcript')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('left-tab-brand')).toHaveAttribute('aria-selected', 'false')
  })

  it('shows media panel content by default', () => {
    render(<LeftPanel />)
    expect(screen.getByTestId('left-panel-content-media')).toBeInTheDocument()
  })
})

describe('LeftPanel — tab switching', () => {
  it('clicking Transcript tab activates it in store', () => {
    render(<LeftPanel />)
    fireEvent.click(screen.getByTestId('left-tab-transcript'))
    expect(useEditorStore.getState().activeLeftTab).toBe('transcript')
  })

  it('clicking Brand tab activates brand in store', () => {
    render(<LeftPanel />)
    fireEvent.click(screen.getByTestId('left-tab-brand'))
    expect(useEditorStore.getState().activeLeftTab).toBe('brand')
  })
})

describe('LeftPanel — empty states', () => {
  it('media empty state shows upload zone when project is open', () => {
    render(<LeftPanel projectId="proj-1" />)
    expect(screen.getByText(/Paste a social URL/i)).toBeInTheDocument()
  })

  it('media empty state prompts to open a project without projectId', () => {
    render(<LeftPanel />)
    expect(screen.getByText(/Open a project to import media/i)).toBeInTheDocument()
  })

  it('brand tab shows the visual library panel', () => {
    useEditorStore.setState({ activeLeftTab: 'brand' })
    render(<LeftPanel />)
    expect(screen.getByTestId('visual-library-panel')).toBeInTheDocument()
  })
})

describe('LeftPanel — pre-selected tab from store', () => {
  it('starts on transcript when store has activeLeftTab = transcript', () => {
    useEditorStore.setState({ activeLeftTab: 'transcript' })
    render(<LeftPanel />)
    expect(screen.getByTestId('left-tab-transcript')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('left-panel-content-transcript')).toBeInTheDocument()
  })
})
