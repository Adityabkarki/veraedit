/**
 * Tests for components/editor/EditorHeader.tsx
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditorHeader } from '@/components/editor/EditorHeader'
import { useEditorStore, initialEditorState } from '@/stores/editorStore'
import { useUIStore, initialUIState } from '@/stores/uiStore'

beforeEach(() => {
  useEditorStore.setState({ ...initialEditorState })
  useUIStore.setState({ ...initialUIState })
})

describe('EditorHeader — layout', () => {
  it('renders the header element', () => {
    render(<EditorHeader projectTitle="My Video" projectId="p1" />)
    expect(screen.getByTestId('editor-header')).toBeInTheDocument()
  })

  it('displays the project title', () => {
    render(<EditorHeader projectTitle="EP4 Demo" projectId="p1" />)
    expect(screen.getByTestId('project-title')).toHaveTextContent('EP4 Demo')
  })

  it('renders back-to-dashboard link', () => {
    render(<EditorHeader projectTitle="Test" projectId="p1" />)
    const link = screen.getByTestId('back-to-dashboard')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/dashboard')
  })

  it('renders undo and redo buttons', () => {
    render(<EditorHeader projectTitle="Test" projectId="p1" />)
    expect(screen.getByTestId('undo-button')).toBeInTheDocument()
    expect(screen.getByTestId('redo-button')).toBeInTheDocument()
  })

  it('renders export button', () => {
    render(<EditorHeader projectTitle="Test" projectId="p1" />)
    expect(screen.getByTestId('export-button')).toBeInTheDocument()
  })

  it('renders shortcuts button', () => {
    render(<EditorHeader projectTitle="Test" projectId="p1" />)
    expect(screen.getByTestId('shortcuts-button')).toBeInTheDocument()
  })
})

describe('EditorHeader — save status', () => {
  it('shows "All changes saved" by default', () => {
    render(<EditorHeader projectTitle="Test" projectId="p1" />)
    expect(screen.getByTestId('save-status')).toHaveTextContent('All changes saved')
  })

  it('shows "Saving…" when saveStatus = saving', () => {
    useEditorStore.setState({ saveStatus: 'saving' })
    render(<EditorHeader projectTitle="Test" projectId="p1" />)
    expect(screen.getByTestId('save-status')).toHaveTextContent('Saving…')
  })

  it('shows "Unsaved changes" when saveStatus = unsaved', () => {
    useEditorStore.setState({ saveStatus: 'unsaved' })
    render(<EditorHeader projectTitle="Test" projectId="p1" />)
    expect(screen.getByTestId('save-status')).toHaveTextContent('Unsaved changes')
  })

  it('shows "Save failed" when saveStatus = error', () => {
    useEditorStore.setState({ saveStatus: 'error' })
    render(<EditorHeader projectTitle="Test" projectId="p1" />)
    expect(screen.getByTestId('save-status')).toHaveTextContent('Save failed')
  })
})

describe('EditorHeader — callbacks', () => {
  it('calls onUndo when undo button is clicked', () => {
    const onUndo = vi.fn()
    render(<EditorHeader projectTitle="Test" projectId="p1" onUndo={onUndo} />)
    fireEvent.click(screen.getByTestId('undo-button'))
    expect(onUndo).toHaveBeenCalledOnce()
  })

  it('calls onRedo when redo button is clicked', () => {
    const onRedo = vi.fn()
    render(<EditorHeader projectTitle="Test" projectId="p1" onRedo={onRedo} />)
    fireEvent.click(screen.getByTestId('redo-button'))
    expect(onRedo).toHaveBeenCalledOnce()
  })

  it('calls onExport when export button is clicked', () => {
    const onExport = vi.fn()
    render(<EditorHeader projectTitle="Test" projectId="p1" onExport={onExport} />)
    fireEvent.click(screen.getByTestId('export-button'))
    expect(onExport).toHaveBeenCalledOnce()
  })

  it('clicking shortcuts button opens modal via UIStore', () => {
    render(<EditorHeader projectTitle="Test" projectId="p1" />)
    fireEvent.click(screen.getByTestId('shortcuts-button'))
    expect(useUIStore.getState().shortcutsOpen).toBe(true)
  })
})
