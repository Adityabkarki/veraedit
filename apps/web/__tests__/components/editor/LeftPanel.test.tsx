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

  it('renders all 4 tab buttons', () => {
    render(<LeftPanel />)
    expect(screen.getByTestId('left-tab-media')).toBeInTheDocument()
    expect(screen.getByTestId('left-tab-scenes')).toBeInTheDocument()
    expect(screen.getByTestId('left-tab-shorts')).toBeInTheDocument()
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
    expect(screen.getByTestId('left-tab-scenes')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('left-tab-shorts')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('left-tab-brand')).toHaveAttribute('aria-selected', 'false')
  })

  it('shows media panel content by default', () => {
    render(<LeftPanel />)
    expect(screen.getByTestId('left-panel-content-media')).toBeInTheDocument()
  })
})

describe('LeftPanel — tab switching', () => {
  it('clicking Scenes tab activates it in store', () => {
    render(<LeftPanel />)
    fireEvent.click(screen.getByTestId('left-tab-scenes'))
    expect(useEditorStore.getState().activeLeftTab).toBe('scenes')
  })

  it('clicking Scenes tab makes it aria-selected', () => {
    render(<LeftPanel />)
    fireEvent.click(screen.getByTestId('left-tab-scenes'))
    expect(screen.getByTestId('left-tab-scenes')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('left-tab-media')).toHaveAttribute('aria-selected', 'false')
  })

  it('clicking Shorts tab shows shorts content', () => {
    render(<LeftPanel />)
    fireEvent.click(screen.getByTestId('left-tab-shorts'))
    expect(screen.getByTestId('left-panel-content-shorts')).toBeInTheDocument()
  })

  it('clicking Brand tab activates brand in store', () => {
    render(<LeftPanel />)
    fireEvent.click(screen.getByTestId('left-tab-brand'))
    expect(useEditorStore.getState().activeLeftTab).toBe('brand')
  })
})

describe('LeftPanel — empty states', () => {
  it('media empty state mentions "No media files"', () => {
    render(<LeftPanel />)
    expect(screen.getByText(/No media files/i)).toBeInTheDocument()
  })

  it('scenes tab shows the scenes panel (ScenesPanel component)', () => {
    useEditorStore.setState({ activeLeftTab: 'scenes' })
    render(<LeftPanel />)
    expect(screen.getByTestId('scenes-panel')).toBeInTheDocument()
  })

  it('shorts tab shows the shorts tab (ShortsTab component)', () => {
    useEditorStore.setState({ activeLeftTab: 'shorts' })
    render(<LeftPanel />)
    expect(screen.getByTestId('shorts-tab')).toBeInTheDocument()
  })

  it('brand tab shows the visual library panel', () => {
    useEditorStore.setState({ activeLeftTab: 'brand' })
    render(<LeftPanel />)
    expect(screen.getByTestId('visual-library-panel')).toBeInTheDocument()
  })

  it('style tab shows style transfer panel when projectId provided', () => {
    useEditorStore.setState({ activeLeftTab: 'style' })
    render(<LeftPanel projectId="proj-1" />)
    expect(screen.getByTestId('style-transfer-tab')).toBeInTheDocument()
  })

  it('renders Style tab button', () => {
    render(<LeftPanel />)
    expect(screen.getByTestId('left-tab-style')).toBeInTheDocument()
  })
})

describe('LeftPanel — pre-selected tab from store', () => {
  it('starts on shorts when store has activeLeftTab = shorts', () => {
    useEditorStore.setState({ activeLeftTab: 'shorts' })
    render(<LeftPanel />)
    expect(screen.getByTestId('left-tab-shorts')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('left-panel-content-shorts')).toBeInTheDocument()
  })
})
