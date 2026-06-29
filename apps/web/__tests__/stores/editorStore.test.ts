/**
 * Tests for stores/editorStore.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  useEditorStore,
  initialEditorState,
  clampLeftPanel,
  clampRightPanel,
  clampTimeline,
  LEFT_PANEL_MIN,
  LEFT_PANEL_MAX,
  LEFT_PANEL_DEFAULT,
  RIGHT_PANEL_MIN,
  RIGHT_PANEL_MAX,
  RIGHT_PANEL_DEFAULT,
  TIMELINE_MIN,
  TIMELINE_MAX,
  TIMELINE_DEFAULT,
} from '@/stores/editorStore'

beforeEach(() => {
  useEditorStore.setState({ ...initialEditorState })
  localStorage.clear()
})

// ── Constants ────────────────────────────────────────────────────────────────

describe('editorStore — constants', () => {
  it('LEFT_PANEL_DEFAULT is between MIN and MAX', () => {
    expect(LEFT_PANEL_DEFAULT).toBeGreaterThanOrEqual(LEFT_PANEL_MIN)
    expect(LEFT_PANEL_DEFAULT).toBeLessThanOrEqual(LEFT_PANEL_MAX)
  })

  it('RIGHT_PANEL_DEFAULT is between MIN and MAX', () => {
    expect(RIGHT_PANEL_DEFAULT).toBeGreaterThanOrEqual(RIGHT_PANEL_MIN)
    expect(RIGHT_PANEL_DEFAULT).toBeLessThanOrEqual(RIGHT_PANEL_MAX)
  })

  it('TIMELINE_DEFAULT is between MIN and MAX', () => {
    expect(TIMELINE_DEFAULT).toBeGreaterThanOrEqual(TIMELINE_MIN)
    expect(TIMELINE_DEFAULT).toBeLessThanOrEqual(TIMELINE_MAX)
  })
})

// ── Clamp helpers ────────────────────────────────────────────────────────────

describe('clampLeftPanel', () => {
  it('returns value unchanged within bounds', () => {
    expect(clampLeftPanel(300)).toBe(300)
  })

  it('clamps to MIN when below', () => {
    expect(clampLeftPanel(0)).toBe(LEFT_PANEL_MIN)
  })

  it('clamps to MAX when above', () => {
    expect(clampLeftPanel(9999)).toBe(LEFT_PANEL_MAX)
  })

  it('accepts exactly MIN', () => {
    expect(clampLeftPanel(LEFT_PANEL_MIN)).toBe(LEFT_PANEL_MIN)
  })

  it('accepts exactly MAX', () => {
    expect(clampLeftPanel(LEFT_PANEL_MAX)).toBe(LEFT_PANEL_MAX)
  })
})

describe('clampRightPanel', () => {
  it('returns value unchanged within bounds', () => {
    expect(clampRightPanel(350)).toBe(350)
  })

  it('clamps to MIN when below', () => {
    expect(clampRightPanel(10)).toBe(RIGHT_PANEL_MIN)
  })

  it('clamps to MAX when above', () => {
    expect(clampRightPanel(9999)).toBe(RIGHT_PANEL_MAX)
  })
})

describe('clampTimeline', () => {
  it('returns value unchanged within bounds', () => {
    expect(clampTimeline(300)).toBe(300)
  })

  it('clamps to MIN when below', () => {
    expect(clampTimeline(0)).toBe(TIMELINE_MIN)
  })

  it('clamps to MAX when above', () => {
    expect(clampTimeline(9999)).toBe(TIMELINE_MAX)
  })
})

// ── Initial state ─────────────────────────────────────────────────────────────

describe('editorStore — initial state', () => {
  it('has default leftPanelWidth', () => {
    expect(useEditorStore.getState().leftPanelWidth).toBe(LEFT_PANEL_DEFAULT)
  })

  it('has default rightPanelWidth', () => {
    expect(useEditorStore.getState().rightPanelWidth).toBe(RIGHT_PANEL_DEFAULT)
  })

  it('has default timelineHeight', () => {
    expect(useEditorStore.getState().timelineHeight).toBe(TIMELINE_DEFAULT)
  })

  it('has activeLeftTab = media', () => {
    expect(useEditorStore.getState().activeLeftTab).toBe('media')
  })

  it('has saveStatus = saved', () => {
    expect(useEditorStore.getState().saveStatus).toBe('saved')
  })

  it('has empty tooltipsDismissed', () => {
    expect(useEditorStore.getState().tooltipsDismissed).toEqual({})
  })
})

// ── Panel size actions ────────────────────────────────────────────────────────

describe('editorStore — setLeftPanelWidth', () => {
  it('sets a valid width', () => {
    useEditorStore.getState().setLeftPanelWidth(350)
    expect(useEditorStore.getState().leftPanelWidth).toBe(350)
  })

  it('clamps below MIN', () => {
    useEditorStore.getState().setLeftPanelWidth(50)
    expect(useEditorStore.getState().leftPanelWidth).toBe(LEFT_PANEL_MIN)
  })

  it('clamps above MAX', () => {
    useEditorStore.getState().setLeftPanelWidth(9999)
    expect(useEditorStore.getState().leftPanelWidth).toBe(LEFT_PANEL_MAX)
  })
})

describe('editorStore — setRightPanelWidth', () => {
  it('sets a valid width', () => {
    useEditorStore.getState().setRightPanelWidth(400)
    expect(useEditorStore.getState().rightPanelWidth).toBe(400)
  })

  it('clamps below MIN', () => {
    useEditorStore.getState().setRightPanelWidth(10)
    expect(useEditorStore.getState().rightPanelWidth).toBe(RIGHT_PANEL_MIN)
  })

  it('clamps above MAX', () => {
    useEditorStore.getState().setRightPanelWidth(9999)
    expect(useEditorStore.getState().rightPanelWidth).toBe(RIGHT_PANEL_MAX)
  })
})

describe('editorStore — setTimelineHeight', () => {
  it('sets a valid height', () => {
    useEditorStore.getState().setTimelineHeight(300)
    expect(useEditorStore.getState().timelineHeight).toBe(300)
  })

  it('clamps below MIN', () => {
    useEditorStore.getState().setTimelineHeight(0)
    expect(useEditorStore.getState().timelineHeight).toBe(TIMELINE_MIN)
  })

  it('clamps above MAX', () => {
    useEditorStore.getState().setTimelineHeight(9999)
    expect(useEditorStore.getState().timelineHeight).toBe(TIMELINE_MAX)
  })
})

// ── Tab + status actions ──────────────────────────────────────────────────────

describe('editorStore — setActiveLeftTab', () => {
  it('switches to transcript', () => {
    useEditorStore.getState().setActiveLeftTab('transcript')
    expect(useEditorStore.getState().activeLeftTab).toBe('transcript')
  })

  it('switches to brand', () => {
    useEditorStore.getState().setActiveLeftTab('brand')
    expect(useEditorStore.getState().activeLeftTab).toBe('brand')
  })

  it('switches back to media', () => {
    useEditorStore.getState().setActiveLeftTab('transcript')
    useEditorStore.getState().setActiveLeftTab('media')
    expect(useEditorStore.getState().activeLeftTab).toBe('media')
  })
})

describe('editorStore — setSaveStatus', () => {
  it('sets to saving', () => {
    useEditorStore.getState().setSaveStatus('saving')
    expect(useEditorStore.getState().saveStatus).toBe('saving')
  })

  it('sets to unsaved', () => {
    useEditorStore.getState().setSaveStatus('unsaved')
    expect(useEditorStore.getState().saveStatus).toBe('unsaved')
  })

  it('sets to error', () => {
    useEditorStore.getState().setSaveStatus('error')
    expect(useEditorStore.getState().saveStatus).toBe('error')
  })

  it('resets to saved', () => {
    useEditorStore.getState().setSaveStatus('error')
    useEditorStore.getState().setSaveStatus('saved')
    expect(useEditorStore.getState().saveStatus).toBe('saved')
  })
})

// ── Tooltip dismissal ─────────────────────────────────────────────────────────

describe('editorStore — tooltip dismissal', () => {
  it('dismissTooltip sets panel key to true', () => {
    useEditorStore.getState().dismissTooltip('left')
    expect(useEditorStore.getState().tooltipsDismissed['left']).toBe(true)
  })

  it('dismissing one panel does not dismiss others', () => {
    useEditorStore.getState().dismissTooltip('left')
    expect(useEditorStore.getState().tooltipsDismissed['ai']).toBeUndefined()
  })

  it('can dismiss multiple panels independently', () => {
    useEditorStore.getState().dismissTooltip('left')
    useEditorStore.getState().dismissTooltip('ai')
    expect(useEditorStore.getState().tooltipsDismissed['left']).toBe(true)
    expect(useEditorStore.getState().tooltipsDismissed['ai']).toBe(true)
    expect(useEditorStore.getState().tooltipsDismissed['timeline']).toBeUndefined()
  })

  it('dismissAllTooltips sets all 4 panels', () => {
    useEditorStore.getState().dismissAllTooltips()
    const { tooltipsDismissed } = useEditorStore.getState()
    expect(tooltipsDismissed['left']).toBe(true)
    expect(tooltipsDismissed['preview']).toBe(true)
    expect(tooltipsDismissed['ai']).toBe(true)
    expect(tooltipsDismissed['timeline']).toBe(true)
  })
})

// ── resetLayout ───────────────────────────────────────────────────────────────

describe('editorStore — resetLayout', () => {
  it('resets all panel sizes to defaults', () => {
    useEditorStore.getState().setLeftPanelWidth(400)
    useEditorStore.getState().setRightPanelWidth(450)
    useEditorStore.getState().setTimelineHeight(400)
    useEditorStore.getState().resetLayout()
    expect(useEditorStore.getState().leftPanelWidth).toBe(LEFT_PANEL_DEFAULT)
    expect(useEditorStore.getState().rightPanelWidth).toBe(RIGHT_PANEL_DEFAULT)
    expect(useEditorStore.getState().timelineHeight).toBe(TIMELINE_DEFAULT)
  })

  it('does not reset activeLeftTab', () => {
    useEditorStore.getState().setActiveLeftTab('brand')
    useEditorStore.getState().resetLayout()
    expect(useEditorStore.getState().activeLeftTab).toBe('brand')
  })

  it('does not reset tooltipsDismissed', () => {
    useEditorStore.getState().dismissTooltip('left')
    useEditorStore.getState().resetLayout()
    expect(useEditorStore.getState().tooltipsDismissed['left']).toBe(true)
  })
})
