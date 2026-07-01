import { describe, it, expect } from 'vitest'
import {
  renderPollMaxAttempts,
  renderTimeoutMessage,
} from '@/lib/renderPoll'

describe('renderPoll', () => {
  it('allows at least 6 minutes for a typical short with captions', () => {
    const attempts = renderPollMaxAttempts({
      videoDurationSeconds: 90,
      clipCount: 30,
      hasCaptions: true,
    })
    expect(attempts * 3).toBeGreaterThanOrEqual(360)
  })

  it('scales up for long multi-clip exports', () => {
    const short = renderPollMaxAttempts({ videoDurationSeconds: 60, clipCount: 1 })
    const heavy = renderPollMaxAttempts({
      videoDurationSeconds: 120,
      clipCount: 30,
      hasCaptions: true,
    })
    expect(heavy).toBeGreaterThan(short)
  })

  it('uses a worker hint only when job stays queued', () => {
    expect(renderTimeoutMessage('queued')).toContain('still queued')
    expect(renderTimeoutMessage('processing')).toContain('still encoding')
  })
})
