'use client'

/**
 * EditorLayout — 4-panel resizable NLE shell.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  EditorHeader (h-12)                                                    │
 * ├──────────┬─────────────────────────────────┬────────────────────────────┤
 * │          │                                 │                            │
 * │ LeftPanel│  VideoPreview                   │  AIPanel                   │
 * │  (280px) │  (fills remaining width)        │  (320px)                   │
 * │          │                                 │                            │
 * ├──────────┴─────────────────────────────────┴────────────────────────────┤
 * │  Timeline (260px)                                                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Panel sizes are draggable and persisted in editorStore.
 */

import { useEditorStore } from '@/stores/editorStore'
import { useUIStore }     from '@/stores/uiStore'
import { ResizeHandle }   from '@/components/editor/ResizeHandle'
import { EditorHeader }   from '@/components/editor/EditorHeader'
import { LeftPanel }      from '@/components/editor/LeftPanel'
import { VideoPreview }   from '@/components/editor/VideoPreview'
import { AIPanel }        from '@/components/editor/AIPanel'
import { Timeline }       from '@/components/editor/Timeline'
import { ShortsMode }           from '@/components/editor/ShortsMode'
import { ScenesPanel }          from '@/components/editor/ScenesPanel'
import { HighlightsTab }        from '@/components/editor/HighlightsTab'
import { EffectsRightPanel }      from '@/components/editor/effects/EffectsRightPanel'
import { StyleTransferTab }       from '@/components/editor/visual/StyleTransferTab'
import { SubtitleEditorPanel }    from '@/components/editor/SubtitleEditorPanel'
import { AIProducerPanel }        from '@/components/editor/AIProducerPanel'
import { KeyboardShortcutsModal } from '@/components/editor/KeyboardShortcutsModal'
import { AnalysisProgressBanner } from '@/components/editor/AnalysisProgressBanner'
import { AutoEditReviewBanner } from '@/components/editor/AutoEditReviewBanner'
import { VideoSpendPanel } from '@/components/editor/VideoSpendPanel'
import { BrollEditPanel } from '@/components/editor/broll/BrollEditPanel'
import { ImageEditPanel } from '@/components/editor/image/ImageEditPanel'
import { CameraZoomEditPanel } from '@/components/editor/camera/CameraZoomEditPanel'
import { OverlayElementEditPanel } from '@/components/editor/overlay/OverlayElementEditPanel'
import { EffectKeyframeEditPanel } from '@/components/editor/keyframes/EffectKeyframeEditPanel'
import { AIBRollPanel } from '@/components/editor/ai/AIBRollPanel'
import { useAssetStore } from '@/stores/assetStore'
import { shouldPollAssetStatus } from '@/hooks/useEditorPipelinePoll'

interface EditorLayoutProps {
  projectTitle: string
  projectId: string
  onUndo?: () => void
  onRedo?: () => void
  onExport?: () => void
}

export function EditorLayout({
  projectTitle,
  projectId,
  onUndo,
  onRedo,
  onExport,
}: EditorLayoutProps) {
  const {
    editorMode,
    leftPanelWidth,
    rightPanelWidth,
    timelineHeight,
    setLeftPanelWidth,
    setRightPanelWidth,
    setTimelineHeight,
    resetLayout,
  } = useEditorStore()

  const { sidebarOpen, aiPanelOpen, rightPanelMode, toggleSidebar, toggleAIPanel } = useUIStore()
  const asset = useAssetStore((s) => s.asset)
  const hideSpendDuringPipeline =
    asset != null && shouldPollAssetStatus(asset.status)

  return (
    <div
      data-testid="editor-layout"
      className="flex flex-col h-screen overflow-hidden bg-bg-base"
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <EditorHeader
        projectTitle={projectTitle}
        projectId={projectId}
        onUndo={onUndo}
        onRedo={onRedo}
        onExport={onExport}
      />

      <AnalysisProgressBanner projectId={projectId} />
      {asset?.id && !hideSpendDuringPipeline && (
        <VideoSpendPanel
          projectId={projectId}
          assetId={asset.id}
          refreshKey={asset.status}
        />
      )}
      <AutoEditReviewBanner />

      {/* ── Shorts mode — full-width grid with in-card video previews ─────── */}
      {editorMode === 'shorts' && (
        <div className="flex-1 overflow-hidden min-h-0">
          <ShortsMode projectId={projectId} />
        </div>
      )}

      {/* ── Chapters mode — full-screen scene management ─────────────────── */}
      {editorMode === 'chapters' && (
        <div className="flex-1 overflow-hidden min-h-0">
          <div className="h-full overflow-y-auto bg-bg-surface">
            <ScenesPanel projectId={projectId} />
          </div>
        </div>
      )}

      {/* ── Promo mode — full-screen highlights ──────────────────────────── */}
      {editorMode === 'promo' && (
        <div className="flex-1 overflow-hidden min-h-0">
          <div className="h-full overflow-y-auto bg-bg-surface">
            <HighlightsTab projectId={projectId} />
          </div>
        </div>
      )}

      {/* ── Standard NLE (Editor mode) ──────────────────────────────────────── */}
      {editorMode === 'editor' && (
      <>

      {/* ── Main three-column area ───────────────────────────────────────────
          We use a flex row so the bottom timeline can be a flex row child too.
          The inner div uses flex-col to stack the "columns row" on top of the
          timeline.
      ──────────────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">

        {/* Columns row: left | preview | right */}
        <div
          data-testid="editor-columns"
          className="flex flex-1 overflow-hidden min-h-0 items-stretch"
          style={{ paddingBottom: 0 }}
        >
          {/* Left panel */}
          {sidebarOpen && (
            <>
              <div
                data-testid="left-panel-wrapper"
                style={{ width: leftPanelWidth, minWidth: leftPanelWidth, maxWidth: leftPanelWidth }}
                className="flex-shrink-0 min-h-0 h-full flex flex-col overflow-hidden"
              >
                <LeftPanel projectId={projectId} />
              </div>

              <ResizeHandle
                direction="horizontal"
                onResize={(delta) => setLeftPanelWidth((w) => w + delta)}
              />
            </>
          )}

          {/* Centre: VideoPreview */}
          <div
            data-testid="center-panel"
            className="flex-1 overflow-hidden min-w-0 min-h-0"
          >
            <VideoPreview />
          </div>

          {/* Right panel */}
          {aiPanelOpen && (
            <>
              <ResizeHandle
                direction="horizontal"
                onResize={(delta) => setRightPanelWidth((w) => w - delta)}
              />

              <div
                data-testid="right-panel-wrapper"
                style={{ width: rightPanelWidth, minWidth: rightPanelWidth, maxWidth: rightPanelWidth }}
                className="flex-shrink-0 min-h-0 h-full flex flex-col overflow-hidden"
              >
                {rightPanelMode === 'captions'
                  ? <SubtitleEditorPanel projectId={projectId} />
                  : rightPanelMode === 'producer'
                  ? <AIProducerPanel />
                  : rightPanelMode === 'effects'
                  ? <EffectsRightPanel projectId={projectId} />
                  : rightPanelMode === 'style'
                  ? <StyleTransferTab projectId={projectId} />
                  : rightPanelMode === 'broll'
                  ? <BrollEditPanel />
                  : rightPanelMode === 'image'
                  ? <ImageEditPanel projectId={projectId} />
                  : rightPanelMode === 'camera'
                  ? <CameraZoomEditPanel />
                  : rightPanelMode === 'overlay-element'
                  ? <OverlayElementEditPanel />
                  : rightPanelMode === 'keyframes'
                  ? <EffectKeyframeEditPanel />
                  : rightPanelMode === 'ai-broll'
                  ? <AIBRollPanel projectId={projectId} />
                  : <AIPanel projectId={projectId} />}
              </div>
            </>
          )}
        </div>

        {/* Horizontal resize handle above timeline */}
        <ResizeHandle
          direction="vertical"
          onResize={(delta) => setTimelineHeight((h) => h - delta)}
        />

        {/* Timeline */}
        <div
          data-testid="timeline-wrapper"
          style={{ height: timelineHeight, minHeight: timelineHeight, maxHeight: timelineHeight }}
          className="flex-shrink-0 overflow-hidden flex flex-col min-h-0"
        >
          <Timeline />
        </div>
      </div>

      {/* Panel toggle buttons — floating on left and right edges */}
      <button
        data-testid="toggle-sidebar"
        onClick={toggleSidebar}
        aria-label={sidebarOpen ? 'Hide left panel ([)' : 'Show left panel ([)'}
        title={sidebarOpen ? 'Hide left panel ([)' : 'Show left panel ([)'}
        className="fixed left-1 top-1/2 -translate-y-1/2 z-10 w-3 h-12 bg-bg-overlay hover:bg-accent/40 border-r border-bg-elevated flex items-center justify-center transition-colors rounded-r pointer-events-auto"
      >
        <svg width="8" height="12" viewBox="0 0 8 12" fill="none" aria-hidden="true">
          <path
            d={sidebarOpen ? 'M6 1L2 6L6 11' : 'M2 1L6 6L2 11'}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-text-disabled"
          />
        </svg>
      </button>

      <button
        data-testid="toggle-ai-panel"
        onClick={toggleAIPanel}
        aria-label={aiPanelOpen ? 'Hide AI panel (])' : 'Show AI panel (])'}
        title={aiPanelOpen ? 'Hide AI panel (])' : 'Show AI panel (])'}
        className="fixed right-1 top-1/2 -translate-y-1/2 z-10 w-3 h-12 bg-bg-overlay hover:bg-accent/40 border-l border-bg-elevated flex items-center justify-center transition-colors rounded-l pointer-events-auto"
      >
        <svg width="8" height="12" viewBox="0 0 8 12" fill="none" aria-hidden="true">
          <path
            d={aiPanelOpen ? 'M2 1L6 6L2 11' : 'M6 1L2 6L6 11'}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-text-disabled"
          />
        </svg>
      </button>

      {/* Shortcuts modal */}
      <KeyboardShortcutsModal />

      </> /* end Editor mode */
      )}
    </div>
  )
}
