import registry from '@/lib/motionComponentRegistry.json'
import { describe, expect, it } from 'vitest'
import {
  buildPropField,
  getEditableFieldsForType,
  getRegistryProps,
} from '@/lib/motionPropSchema'

describe('motionPropSchema', () => {
  it('exposes registry props for guest_intro including colors', () => {
    const fields = getEditableFieldsForType('guest_intro')
    const keys = fields.map((f) => f.key)
    expect(keys).toContain('title')
    expect(keys).toContain('brandColor')
    expect(keys).toContain('textColor')
  })

  it('maps stat_counter value as number field', () => {
    const field = buildPropField('value', 'stat_counter')
    expect(field?.type).toBe('number')
    expect(field?.section).toBe('content')
  })

  it('maps bar_chart labels as string list', () => {
    const field = buildPropField('labels', 'bar_chart')
    expect(field?.type).toBe('stringList')
  })

  it('includes atomic pillar types from registry', () => {
    expect(getRegistryProps('metric_ticker')).toContain('value')
    expect(getRegistryProps('strategy_funnel')).toContain('labels')
    expect(getEditableFieldsForType('vertical_clip_template').map((f) => f.key)).toContain('accentColor')
  })

  it('covers every motion type with at least one editable field', () => {
    const types = Object.keys(registry as Record<string, unknown>)
    const empty = types.filter((t) => getEditableFieldsForType(t).length === 0)
    expect(empty).toEqual([])
  })
})
