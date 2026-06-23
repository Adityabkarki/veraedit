/**
 * Tests for components/dashboard/ProjectCard.tsx
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProjectCard } from '@/components/dashboard/ProjectCard'
import type { Project } from '@/stores/projectStore'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const readyProject: Project = {
  id: 'p1',
  title: 'My Nepali Vlog',
  thumbnail_url: null,
  status: 'ready',
  duration_seconds: 300,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  cost_usd: 0.042,
  scenes_count: 8,
  suggestions_count: 12,
  shorts_count: 3,
  processing_stage: null,
  processing_progress: null,
}

const processingProject: Project = {
  ...readyProject,
  id: 'p2',
  status: 'processing',
  duration_seconds: null,
  processing_stage: 'transcribing',
  processing_progress: 45,
}

const uploadingProject: Project = {
  ...readyProject,
  id: 'p3',
  status: 'uploading',
  duration_seconds: null,
  processing_stage: 'uploading',
  processing_progress: 30,
}

const failedProject: Project = {
  ...readyProject,
  id: 'p4',
  status: 'failed',
}

// ── Ready project ─────────────────────────────────────────────────────────────

describe('ProjectCard — ready project', () => {
  it('renders the project title', () => {
    render(<ProjectCard project={readyProject} />)
    expect(screen.getByText('My Nepali Vlog')).toBeInTheDocument()
  })

  it('renders "Ready" badge', () => {
    render(<ProjectCard project={readyProject} />)
    expect(screen.getByText('Ready')).toBeInTheDocument()
  })

  it('renders the duration', () => {
    render(<ProjectCard project={readyProject} />)
    expect(screen.getByText('5m 0s')).toBeInTheDocument()
  })

  it('renders scenes count', () => {
    render(<ProjectCard project={readyProject} />)
    expect(screen.getByText('8 scenes')).toBeInTheDocument()
  })

  it('renders cost', () => {
    render(<ProjectCard project={readyProject} />)
    expect(screen.getByText('$0.042')).toBeInTheDocument()
  })

  it('renders an "Open Editor" link', () => {
    render(<ProjectCard project={readyProject} />)
    expect(screen.getByRole('link', { name: /Open Editor/i })).toBeInTheDocument()
  })

  it('"Open Editor" link points to the correct route', () => {
    render(<ProjectCard project={readyProject} />)
    const link = screen.getByRole('link', { name: /Open Editor/i })
    expect(link).toHaveAttribute('href', '/editor/p1')
  })
})

// ── Processing project ────────────────────────────────────────────────────────

describe('ProjectCard — processing project', () => {
  it('renders "Processing" badge', () => {
    render(<ProjectCard project={processingProject} />)
    expect(screen.getByText('Processing')).toBeInTheDocument()
  })

  it('renders the transcribing stage label', () => {
    render(<ProjectCard project={processingProject} />)
    expect(screen.getByText(/Transcribing in Nepali/i)).toBeInTheDocument()
  })

  it('renders a progress bar', () => {
    render(<ProjectCard project={processingProject} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toBeInTheDocument()
    expect(bar).toHaveAttribute('aria-valuenow', '45')
  })

  it('does not render "Open Editor" link', () => {
    render(<ProjectCard project={processingProject} />)
    expect(screen.queryByRole('link', { name: /Open Editor/i })).not.toBeInTheDocument()
  })

  it('does not render duration while processing', () => {
    render(<ProjectCard project={processingProject} />)
    expect(screen.queryByText(/5m 0s/)).not.toBeInTheDocument()
  })
})

// ── Uploading project ─────────────────────────────────────────────────────────

describe('ProjectCard — uploading project', () => {
  it('renders "Uploading" badge', () => {
    render(<ProjectCard project={uploadingProject} />)
    expect(screen.getByText('Uploading')).toBeInTheDocument()
  })

  it('renders upload stage label', () => {
    render(<ProjectCard project={uploadingProject} />)
    expect(screen.getByText('Uploading...')).toBeInTheDocument()
  })
})

// ── Failed project ────────────────────────────────────────────────────────────

describe('ProjectCard — failed project', () => {
  it('renders "Failed" badge', () => {
    render(<ProjectCard project={failedProject} />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('does not render "Open Editor" link', () => {
    render(<ProjectCard project={failedProject} />)
    expect(screen.queryByRole('link', { name: /Open Editor/i })).not.toBeInTheDocument()
  })
})

// ── Thumbnail ─────────────────────────────────────────────────────────────────

describe('ProjectCard — thumbnail', () => {
  it('renders thumbnail image when URL is provided', () => {
    const project: Project = { ...readyProject, thumbnail_url: 'https://example.com/thumb.jpg' }
    render(<ProjectCard project={project} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/thumb.jpg')
  })
})
