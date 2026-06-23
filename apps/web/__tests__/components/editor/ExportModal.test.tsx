/**
 * Tests for components/editor/ExportModal.tsx
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExportModal } from '@/components/editor/ExportModal'
import { resetEditorStores } from '@/__tests__/helpers/editorStoreReset'

beforeEach(() => {
  resetEditorStores()
})

describe('ExportModal', () => {
  it('renders nothing when closed', () => {
    render(<ExportModal projectId="p1" open={false} onClose={() => {}} />)
    expect(screen.queryByTestId('export-modal')).not.toBeInTheDocument()
  })

  it('shows platform options when open', () => {
    render(<ExportModal projectId="p1" open onClose={() => {}} />)
    expect(screen.getByTestId('export-modal')).toBeInTheDocument()
    expect(screen.getByTestId('export-platform-youtube')).toBeInTheDocument()
    expect(screen.getByTestId('export-platform-tiktok')).toBeInTheDocument()
    expect(screen.getByTestId('export-start')).toBeInTheDocument()
  })
})
