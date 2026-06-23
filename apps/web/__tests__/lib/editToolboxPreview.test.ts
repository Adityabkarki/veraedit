/**
 * Tests for lib/editToolboxPreview.ts
 */

import { describe, it, expect } from 'vitest'
import { toolboxPreviewMeta, toolboxPreviewStyle } from '@/lib/editToolboxPreview'
import type { EditToolboxTool } from '@/lib/styleTransfer'

function tool(partial: Partial<EditToolboxTool> & Pick<EditToolboxTool, 'id' | 'category'>): EditToolboxTool {
  return {
    id: partial.id,
    name: partial.id,
    status: 'supported',
    renderer: 'test',
    category: partial.category,
    discovered: true,
    ...partial,
  }
}

describe('toolboxPreviewStyle', () => {
  it('returns category default for unknown tools', () => {
    const style = toolboxPreviewStyle(tool({ id: 'unknown_vfx', category: 'vfx' }))
    expect(style.background).toContain('gradient')
    expect(style.hint).toBe('✦')
  })

  it('overrides broll_insert to black preview', () => {
    const style = toolboxPreviewStyle(tool({ id: 'broll_insert', category: 'broll' }))
    expect(style.background).toBe('#000000')
  })

  it('overrides dissolve transition preview', () => {
    const style = toolboxPreviewStyle(tool({ id: 'dissolve_transition', category: 'transitions' }))
    expect(style.background).toContain('gradient')
  })

  it('assigns sfx preview kind and sfxType for whoosh tools', () => {
    const meta = toolboxPreviewMeta(tool({ id: 'sfx_whoosh_cut', category: 'audio' }))
    expect(meta.kind).toBe('sfx')
    expect(meta.sfxType).toBe('whoosh')
  })

  it('assigns broll preview kind for cutaway slots', () => {
    const meta = toolboxPreviewMeta(tool({ id: 'broll_insert', category: 'broll' }))
    expect(meta.kind).toBe('broll')
  })

  it('assigns zoom-punch kind for digital zoom punch', () => {
    const meta = toolboxPreviewMeta(tool({ id: 'digital_zoom_punch', category: 'camera' }))
    expect(meta.kind).toBe('zoom-punch')
  })
})
