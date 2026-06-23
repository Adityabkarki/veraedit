import { describe, it, expect, beforeEach } from 'vitest'
import {
  useEditorStore,
  LEFT_PANEL_DEFAULT,
  initialEditorState,
} from '@/stores/editorStore'

beforeEach(() => {
  localStorage.clear()
  useEditorStore.setState({ ...initialEditorState })
})

describe('editorStore panel resize', () => {
  it('applies incremental left panel drag via functional updater', () => {
    const { setLeftPanelWidth } = useEditorStore.getState()
    setLeftPanelWidth((w) => w + 20)
    setLeftPanelWidth((w) => w + 30)
    expect(useEditorStore.getState().leftPanelWidth).toBe(LEFT_PANEL_DEFAULT + 50)
  })

  it('applies incremental right panel drag via functional updater', () => {
    const { setRightPanelWidth } = useEditorStore.getState()
    setRightPanelWidth((w) => w - 15)
    setRightPanelWidth((w) => w - 10)
    expect(useEditorStore.getState().rightPanelWidth).toBe(
      initialEditorState.rightPanelWidth - 25,
    )
  })
})
