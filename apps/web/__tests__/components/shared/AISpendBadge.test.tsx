/**
 * Tests for components/shared/AISpendBadge.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AISpendBadge } from '@/components/shared/AISpendBadge'

const getProjectSpend = vi.fn()

vi.mock('@/lib/aiSpendApi', () => ({
  getProjectSpend: (...args: unknown[]) => getProjectSpend(...args),
  ACTION_LABELS: {
    style_analyze: 'Analyzing reference video',
  },
}))

describe('AISpendBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getProjectSpend.mockResolvedValue({
      data: {
        project_id: 'proj-1',
        total_usd: 0.125,
        total_cost_usd: 0.125,
        by_action: { style_analyze: 0.05, asset_tagging: 0.075 },
        call_count: 3,
        row_count: 3,
        budget_used_percent: 6,
      },
      error: null,
    })
  })

  it('shows live spend total', async () => {
    render(<AISpendBadge projectId="proj-1" />)
    expect(await screen.findByText('$0.125')).toBeInTheDocument()
    expect(screen.getByText('AI spend')).toBeInTheDocument()
  })

  it('expands to show action breakdown', async () => {
    render(<AISpendBadge projectId="proj-1" />)
    await screen.findByText('$0.125')
    fireEvent.click(screen.getByRole('button', { name: /AI spend/i }))
    expect(screen.getByText('Analyzing reference video')).toBeInTheDocument()
    expect(screen.getByText(/3 AI calls so far/)).toBeInTheDocument()
  })
})
