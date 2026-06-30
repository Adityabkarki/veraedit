/**
 * Tests for components/oneclick/ProjectHome.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProjectHome } from '@/components/oneclick/ProjectHome'

vi.mock('@/components/shared/AISpendBadge', () => ({
  AISpendBadge: () => <div data-testid="ai-spend-badge-mock" />,
}))

describe('ProjectHome', () => {
  it('renders the four one-click actions', () => {
    render(<ProjectHome projectId="proj-1" />)

    expect(screen.getByText('What do you want to make?')).toBeInTheDocument()
    expect(screen.getByTestId('project-action-clone-style')).toBeInTheDocument()
    expect(screen.getByTestId('project-action-shorts')).toBeInTheDocument()
    expect(screen.getByTestId('project-action-chapters')).toBeInTheDocument()
    expect(screen.getByTestId('project-action-trailer')).toBeInTheDocument()
  })

  it('links actions under the project path', () => {
    render(<ProjectHome projectId="proj-42" />)

    expect(screen.getByTestId('project-action-clone-style')).toHaveAttribute(
      'href',
      '/projects/proj-42/clone-style',
    )
    expect(screen.getByTestId('project-action-shorts')).toHaveAttribute(
      'href',
      '/projects/proj-42/shorts',
    )
  })
})
