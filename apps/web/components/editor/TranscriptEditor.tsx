'use client'

/**
 * TranscriptEditor — Descript-style interactive transcript panel.
 *
 * Features:
 *   T-4.7.1  Click word → seeks player + timeline to that timestamp
 *   T-4.7.1  Playback sync: current word underlined in accent colour
 *   T-4.7.1  Speaker headers with colour labels (A = blue, B = orange)
 *   T-4.7.1  Filler words: amber background
 *   T-4.7.1  Silence blocks: grey inline pill showing duration
 *   T-4.7.1  Deleted words: strikethrough + dimmed
 *   T-4.7.2  Text-select → SelectionToolbar → Delete confirmation modal
 *   T-4.7.3  FillerControls: "Remove all fillers" + time-saved preview
 *   T-4.7.4  "Remove all silences > 0.8s" in FillerControls
 *   T-4.7.5  Ctrl+F search bar with ↑↓ navigation + highlighting
 *
 * Layout:
 *   ┌─ toolbar: [Search] [Reset]  ──────────────────────────────────┐
 *   ├─ FillerControls (when fillers / silences detected) ───────────┤
 *   ├─ [TranscriptSearch bar — visible when Ctrl+F pressed] ────────┤
 *   └─ Scrollable transcript text ──────────────────────────────────┘
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react'
import {
  useTranscriptStore,
  SPEAKER_COLORS,
} from '@/stores/transcriptStore'
import { useAssetStore } from '@/stores/assetStore'
import { RegenerateConfirmDialog } from '@/components/editor/RegenerateConfirmDialog'
import type { RegenerateErrorDetail } from '@/lib/pipelineApi'
import { usePipelineRegenerate } from '@/lib/usePipelineRegenerate'
import { toast } from 'sonner'
import { usePlayerStore }    from '@/stores/playerStore'
import { TranscriptWord }    from '@/components/editor/transcript/TranscriptWord'
import { TranscriptSilence } from '@/components/editor/transcript/TranscriptSilence'
import { TranscriptSearch }  from '@/components/editor/transcript/TranscriptSearch'
import { FillerControls }    from '@/components/editor/transcript/FillerControls'
import {
  SelectionToolbar,
  DeleteConfirmModal,
} from '@/components/editor/transcript/SelectionToolbar'
import { TextEditorPanel } from '@/components/editor/TextEditorPanel'

export function TranscriptEditor({ projectId }: { projectId?: string } = {}) {
  const {
    segments,
    words,
    selectedWordIds,
    currentWordId,
    searchMatchIds,
    searchIndex,
    qualityMetrics,
    setCurrentWordId,
    setSelectedWordIds,
    clearSelection,
    setPendingDelete,
    resetTranscript,
  } = useTranscriptStore()

  const asset = useAssetStore((s) => s.asset)
  const [regenerating, setRegenerating] = useState(false)

  const { currentTime } = usePlayerStore()
  const containerRef    = useRef<HTMLDivElement>(null)
  const [searchOpen, setSearchOpen]         = useState(false)
  const [cutMode, setCutMode]               = useState(false)
  const [toolbarPos, setToolbarPos]         = useState<{ x: number; y: number } | null>(null)

  // ── Sync currentWordId with player time ────────────────────────────────────
  useEffect(() => {
    const found = words.find(
      (w) => !w.deleted && w.type !== 'silence' && currentTime >= w.startTime && currentTime < w.endTime
    )
    setCurrentWordId(found?.id ?? null)
  }, [currentTime, words, setCurrentWordId])

  // ── Scroll current word into view ─────────────────────────────────────────
  useEffect(() => {
    if (!currentWordId) return
    const el = containerRef.current?.querySelector(`[data-word-id="${currentWordId}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentWordId])

  // ── Scroll focused search match into view ─────────────────────────────────
  useEffect(() => {
    if (!searchMatchIds.length) return
    const focusedId = searchMatchIds[searchIndex]
    if (!focusedId) return
    const el = containerRef.current?.querySelector(`[data-word-id="${focusedId}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [searchMatchIds, searchIndex])

  // ── Text selection → floating toolbar ─────────────────────────────────────
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) {
      clearSelection()
      setToolbarPos(null)
      return
    }

    const container = containerRef.current
    if (!container) return

    // Collect selected word IDs from within the container
    const allWordEls = container.querySelectorAll('[data-word-id]')
    const selectedIds: string[] = []

    for (const el of allWordEls) {
      if (selection.containsNode(el, true)) {
        const id = el.getAttribute('data-word-id')
        const word = words.find((w) => w.id === id)
        if (id && word && !word.deleted && word.type !== 'silence') {
          selectedIds.push(id)
        }
      }
    }

    if (selectedIds.length > 0) {
      setSelectedWordIds(selectedIds)
      // Position toolbar at midpoint of selection bounding rect
      try {
        const range = selection.getRangeAt(0)
        const rect  = range.getBoundingClientRect()
        setToolbarPos({ x: rect.left + rect.width / 2, y: rect.top })
      } catch {
        setToolbarPos(null)
      }
    } else {
      clearSelection()
      setToolbarPos(null)
    }
  }, [words, setSelectedWordIds, clearSelection])

  // ── Keyboard shortcut: Ctrl+F ──────────────────────────────────────────────
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        const isInTranscript = containerRef.current?.contains(document.activeElement)
        if (isInTranscript || document.activeElement === document.body) {
          e.preventDefault()
          setSearchOpen(true)
        }
      }
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [])

  // ── Right-click on words → delete shortcut ─────────────────────────────────
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      const wordId = target.getAttribute('data-word-id')
      if (!wordId) return
      e.preventDefault()
      const ids = selectedWordIds.includes(wordId) ? selectedWordIds : [wordId]
      setSelectedWordIds(ids)
      setPendingDelete(ids)
    },
    [selectedWordIds, setSelectedWordIds, setPendingDelete]
  )

  // ── Computed helpers ───────────────────────────────────────────────────────
  const searchMatchSet  = useMemo(() => new Set(searchMatchIds), [searchMatchIds])
  const focusedMatchId  = searchMatchIds[searchIndex] ?? null
  const selectedSet     = useMemo(() => new Set(selectedWordIds), [selectedWordIds])

  const activeWordCount  = words.filter((w) => !w.deleted && w.type === 'word').length
  const deletedWordCount = words.filter((w) => w.deleted).length

  const { loading: pipelineLoading, loadCosts, runTranscript } = usePipelineRegenerate(
    projectId,
    asset?.id,
  )
  const [txDialogOpen, setTxDialogOpen] = useState(false)
  const [txConfirmMeta, setTxConfirmMeta] = useState<RegenerateErrorDetail | null>(null)

  const handleRegenerate = async () => {
    if (!projectId || !asset?.id) {
      toast.error('Open a project with an uploaded video first.')
      return
    }
    setRegenerating(true)
    const costs = await loadCosts()
    if (costs?.transcript.partial) {
      const r = await runTranscript(undefined, true)
      setRegenerating(false)
      if (!r.ok && r.needsConfirm && r.detail) {
        setTxConfirmMeta(r.detail)
        setTxDialogOpen(true)
      }
      return
    }
    const r = await runTranscript()
    setRegenerating(false)
    if (r.needsConfirm && r.detail) {
      setTxConfirmMeta(r.detail)
      setTxDialogOpen(true)
      return
    }
    if (!r.ok && costs && !costs.transcript.ready) {
      await runTranscript()
    }
  }

  return (
    <>
      <RegenerateConfirmDialog
        open={txDialogOpen}
        title="Regenerate transcript"
        description="Replaces the full transcript and clears chapters and shorts. Uses ElevenLabs Scribe (billed by audio length)."
        costLabel={
          txConfirmMeta?.estimated_cost_label ?? '~$0.05 ElevenLabs Scribe (estimated)'
        }
        confirmPhrase={txConfirmMeta?.confirmation_phrase ?? 'Regenerate'}
        confirmButtonLabel="Regenerate transcript"
        loading={regenerating || pipelineLoading}
        onClose={() => setTxDialogOpen(false)}
        onConfirm={async (typed) => {
          setRegenerating(true)
          const r = await runTranscript(typed, false)
          setRegenerating(false)
          if (r.ok) setTxDialogOpen(false)
        }}
      />
      <div
        data-testid="transcript-editor"
        className="flex flex-col h-full bg-bg-surface overflow-hidden"
      >
        {/* ── Toolbar ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-bg-overlay flex-shrink-0">
          <h3 className="text-xs font-semibold text-text-primary flex-1">Transcript</h3>

          {/* Word counts */}
          <span className="text-[10px] text-text-disabled">
            {activeWordCount}w
            {deletedWordCount > 0 && ` · ${deletedWordCount} deleted`}
            {qualityMetrics?.quality_grade && (
              <> · Grade {qualityMetrics.quality_grade}</>
            )}
          </span>

          <button
            type="button"
            data-testid="toggle-cut-mode"
            onClick={() => setCutMode((v) => !v)}
            aria-pressed={cutMode}
            title="Text-based video cuts"
            className={[
              'px-2 py-1 rounded text-[10px] font-medium transition-colors',
              cutMode
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-accent hover:bg-accent/10',
            ].join(' ')}
          >
            {cutMode ? 'Script' : 'Cut video'}
          </button>

          {projectId && asset?.id && (
            <button
              type="button"
              data-testid="regenerate-transcript"
              disabled={regenerating}
              onClick={() => void handleRegenerate()}
              title="Resume partial transcription or regenerate (ElevenLabs)"
              className="px-2 py-1 rounded text-[10px] font-medium text-text-secondary
                         hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
            >
              {regenerating ? 'Regenerating…' : '↻ Regenerate'}
            </button>
          )}

          {/* Search button */}
          <button
            data-testid="open-search"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Search transcript (Ctrl+F)"
            title="Search (Ctrl+F)"
            className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M8.5 8.5L11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>

          {/* Reset */}
          <button
            data-testid="reset-transcript"
            onClick={resetTranscript}
            aria-label="Reset transcript"
            title="Restore all deleted words"
            className="p-1.5 rounded text-text-disabled hover:text-text-secondary hover:bg-bg-overlay transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path d="M2 6.5C2 4 4 2 6.5 2C9 2 11 4 11 6.5"
                stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M2 3V6.5H5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* ── Filler / silence controls ─────────────────────────────────── */}
        {!cutMode && <FillerControls />}

        {/* ── Search bar ────────────────────────────────────────────────── */}
        {!cutMode && searchOpen && (
          <TranscriptSearch onClose={() => { setSearchOpen(false) }} />
        )}

        {/* ── Text-based cut mode (Module 04) ───────────────────────────── */}
        {cutMode ? (
          <TextEditorPanel projectId={projectId} />
        ) : (
        <>
        {/* ── Transcript body ────────────────────────────────────────────── */}
        <div
          ref={containerRef}
          data-testid="transcript-body"
          className="flex-1 overflow-y-auto p-4 text-sm text-text-primary leading-loose"
          onMouseUp={handleMouseUp}
          onContextMenu={handleContextMenu}
        >
          {segments.map((segment, si) => {
            const color = SPEAKER_COLORS[segment.speakerId]
            const nextSeg = segments[si + 1]
            const speakerChanged = !nextSeg || nextSeg.speakerId !== segment.speakerId

            return (
              <div key={segment.id} className="mb-3" data-testid={`segment-${segment.id}`}>
                {/* Speaker label */}
                <div
                  data-testid={`speaker-label-${segment.speakerId}`}
                  className="text-[10px] font-semibold mb-1 uppercase tracking-wider"
                  style={{ color }}
                >
                  Speaker {segment.speakerId}
                </div>

                {/* Words */}
                <p className="select-text">
                  {segment.words.map((word) => {
                    if (word.type === 'silence') {
                      return <TranscriptSilence key={word.id} word={word} />
                    }
                    return (
                      <TranscriptWord
                        key={word.id}
                        word={word}
                        isCurrent={word.id === currentWordId}
                        isSelected={selectedSet.has(word.id)}
                        isSearchMatch={searchMatchSet.has(word.id)}
                        isFocusedMatch={word.id === focusedMatchId}
                      />
                    )
                  })}
                </p>
              </div>
            )
          })}

          {/* Empty state */}
          {words.every((w) => w.deleted) && (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
              <p className="text-sm text-text-secondary">All words deleted.</p>
              <button
                onClick={resetTranscript}
                className="text-xs text-accent hover:text-accent-glow underline"
              >
                Restore all
              </button>
            </div>
          )}
        </div>
        </>
        )}
      </div>

      {/* ── Floating toolbar above selection ─────────────────────────────── */}
      {!cutMode && <SelectionToolbar position={toolbarPos} />}

      {/* ── Delete confirmation modal ────────────────────────────────────── */}
      {!cutMode && <DeleteConfirmModal />}
    </>
  )
}
