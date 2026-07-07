import { describe, it, expect } from 'vitest'
import { MulticamCompositor } from '../MulticamCompositor'

describe('MulticamCompositor', () => {
  it('exports a sequence-based compositor', () => {
    expect(MulticamCompositor).toBeTypeOf('function')
  })
})
