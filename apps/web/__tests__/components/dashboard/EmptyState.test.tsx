/**
 * Tests for components/dashboard/EmptyState.tsx
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyState } from '@/components/dashboard/EmptyState'

describe('EmptyState', () => {
  it('renders the "No projects yet" heading', () => {
    render(<EmptyState onUpload={vi.fn()} onSample={vi.fn()} />)
    expect(screen.getByText('No projects yet')).toBeInTheDocument()
  })

  it('renders descriptive text', () => {
    render(<EmptyState onUpload={vi.fn()} onSample={vi.fn()} />)
    expect(screen.getByText(/Upload your first video/i)).toBeInTheDocument()
  })

  it('renders an "Upload Video" button', () => {
    render(<EmptyState onUpload={vi.fn()} onSample={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Upload Video/i })).toBeInTheDocument()
  })

  it('renders a "Use Sample Video" button', () => {
    render(<EmptyState onUpload={vi.fn()} onSample={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Use Sample Video/i })).toBeInTheDocument()
  })

  it('calls onUpload when Upload Video is clicked', () => {
    const onUpload = vi.fn()
    render(<EmptyState onUpload={onUpload} onSample={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Upload Video/i }))
    expect(onUpload).toHaveBeenCalledOnce()
  })

  it('calls onSample when Use Sample Video is clicked', () => {
    const onSample = vi.fn()
    render(<EmptyState onUpload={vi.fn()} onSample={onSample} />)
    fireEvent.click(screen.getByRole('button', { name: /Use Sample Video/i }))
    expect(onSample).toHaveBeenCalledOnce()
  })

  it('shows supported file format hint (MP4)', () => {
    render(<EmptyState onUpload={vi.fn()} onSample={vi.fn()} />)
    expect(screen.getByText(/MP4/i)).toBeInTheDocument()
  })

  it('shows the 10 GB size limit', () => {
    render(<EmptyState onUpload={vi.fn()} onSample={vi.fn()} />)
    expect(screen.getByText(/10 GB/i)).toBeInTheDocument()
  })

  it('has correct region role for accessibility', () => {
    render(<EmptyState onUpload={vi.fn()} onSample={vi.fn()} />)
    expect(screen.getByRole('region', { name: /No projects/i })).toBeInTheDocument()
  })
})
