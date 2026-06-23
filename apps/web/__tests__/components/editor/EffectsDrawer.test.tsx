/**
 * Tests for EffectsPanel / unified effects browser
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EffectsPanel } from '@/components/editor/effects/EffectsPanel'
import { useEffectsStore } from '@/stores/effectsStore'
import { useEditorStore, initialEditorState } from '@/stores/editorStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { useScenesStore } from '@/stores/scenesStore'
import { useShortsStore } from '@/stores/shortsStore'
import { usePlayerStore, initialPlayerState } from '@/stores/playerStore'
import { useUIStore, initialUIState } from '@/stores/uiStore'

beforeEach(() => {
  useEffectsStore.setState({
    isOpen: false,
    activeTab: 'tools',
    searchQuery: '',
    recentlyUsed: [],
    lastApplied: null,
  })
  useEditorStore.setState({ ...initialEditorState, tooltipsDismissed: { timeline: true } })
  useTimelineStore.getState().resetTimeline()
  useTimelineStore.getState().loadDemoData()
  usePlayerStore.setState({ ...initialPlayerState })
  useUIStore.setState({ ...initialUIState })
  useScenesStore.getState().resetScenes()
  useShortsStore.getState().resetShorts()
  localStorage.clear()
})

describe('EffectsPanel — unified catalog', () => {
  it('renders search and edit toolbox', () => {
    render(<EffectsPanel onClose={() => {}} />)
    expect(screen.getByTestId('effects-panel')).toBeInTheDocument()
    expect(screen.getByTestId('effects-search')).toBeInTheDocument()
    expect(screen.getByText(/Loading edit elements/)).toBeInTheDocument()
  })

  it('shows unified category chips when catalog loads', async () => {
    render(<EffectsPanel />)
    expect(await screen.findByTestId('toolbox-cat-all')).toBeInTheDocument()
  })

  it('close button calls onClose', () => {
    let closed = false
    render(<EffectsPanel onClose={() => { closed = true }} />)
    fireEvent.click(screen.getByTestId('effects-drawer-close'))
    expect(closed).toBe(true)
  })

  it('typing in search updates searchQuery', () => {
    render(<EffectsPanel />)
    fireEvent.change(screen.getByTestId('effects-search'), { target: { value: 'zoom' } })
    expect(useEffectsStore.getState().searchQuery).toBe('zoom')
  })
})
