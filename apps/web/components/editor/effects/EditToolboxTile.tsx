'use client'

import { useCallback, useRef, useState } from 'react'
import type { EditToolboxTool } from '@/lib/styleTransfer'
import {
  toolboxPreviewMeta,
  toolboxPreviewAnimClass,
} from '@/lib/editToolboxPreview'
import { playStyleTransferSfx } from '@/lib/styleTransferSfx'

interface EditToolboxTileProps {
  tool: EditToolboxTool
  onApply: (tool: EditToolboxTool) => void
}

export function EditToolboxTile({ tool, onApply }: EditToolboxTileProps) {
  const [hovering, setHovering] = useState(false)
  const sfxPlayed = useRef(false)
  const preview = toolboxPreviewMeta(tool)
  const disabled = !tool.available && !tool.discovered

  const handleEnter = useCallback(() => {
    setHovering(true)
    if (preview.sfxType && !sfxPlayed.current) {
      sfxPlayed.current = true
      playStyleTransferSfx(preview.sfxType, 0.28, tool.id)
    }
  }, [preview.sfxType])

  const handleLeave = useCallback(() => {
    setHovering(false)
    sfxPlayed.current = false
  }, [])

  return (
    <button
      key={tool.id}
      type="button"
      data-testid={`edit-tool-${tool.id}`}
      disabled={disabled}
      title={tool.description || tool.name}
      onClick={() => onApply(tool)}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      className="flex flex-col items-center gap-1.5 group disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <div
        className="w-full aspect-video rounded-lg overflow-hidden relative border-2 border-transparent
                   group-hover:border-accent group-focus-visible:border-accent transition-colors"
        style={{ background: preview.background }}
        data-preview-kind={preview.kind}
      >
        {/* Animated preview layer */}
        <div
          className={[
            'absolute inset-0 flex items-center justify-center pointer-events-none',
            hovering ? toolboxPreviewAnimClass(preview.kind) : '',
          ].join(' ')}
          aria-hidden="true"
        >
          {preview.kind === 'transition-cut' && (
            <>
              <div className="absolute left-0 top-0 bottom-0 w-1/2 bg-black/40" />
              <div className="tb-preview-wipe absolute inset-y-0 w-1 bg-white/70" />
            </>
          )}
          {preview.kind === 'transition-dissolve' && (
            <div className="absolute inset-0 bg-white/20 tb-preview-dissolve" />
          )}
          {preview.kind === 'transition-fade' && (
            <div className="absolute inset-0 bg-black tb-preview-fade" />
          )}
          {preview.kind === 'transition-zoom' && (
            <div className="absolute inset-2 rounded border border-white/30 tb-preview-zoom-ring" />
          )}
          {preview.kind === 'broll' && (
            <div className="absolute inset-0 tb-preview-broll-scan opacity-40" />
          )}
          {preview.kind === 'music' && (
            <div className="flex items-end gap-0.5 h-6">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-1 bg-emerald-300/80 rounded-sm tb-preview-music-bar"
                  style={{ animationDelay: `${i * 0.08}s` }}
                />
              ))}
            </div>
          )}
          {preview.kind === 'layout-split' && (
            <>
              <div className="absolute left-0 top-0 bottom-0 w-1/2 bg-white/10 border-r border-white/30" />
              <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-white/5" />
            </>
          )}
          {preview.kind === 'layout-pip' && (
            <div className="absolute bottom-1 right-1 w-1/3 h-1/3 rounded border border-white/50 bg-white/10 tb-preview-pip" />
          )}
          {(preview.kind === 'caption-pop' ||
            preview.kind === 'caption-word' ||
            preview.kind === 'caption-slide' ||
            preview.kind === 'overlay-slide' ||
            preview.kind === 'layout-split' ||
            preview.kind === 'layout-pip' ||
            preview.kind === 'pacing') &&
            (preview.previewLabel || preview.hint) && (
              <span
                className={[
                  'text-[11px] font-bold text-white drop-shadow-md px-1',
                  preview.kind === 'caption-pop' ? 'tb-preview-caption-pop' : '',
                  preview.kind === 'caption-word' ? 'tb-preview-caption-word' : '',
                  preview.kind === 'caption-slide' ? 'tb-preview-caption-slide' : '',
                  preview.kind === 'overlay-slide' ? 'tb-preview-overlay-slide' : '',
                  preview.kind === 'pacing' ? 'tb-preview-pacing' : '',
                ].join(' ')}
              >
                {preview.previewLabel ?? preview.hint}
              </span>
            )}
          {(preview.kind === 'zoom-in' || preview.kind === 'zoom-punch') && (
            <div
              className={[
                'absolute inset-3 rounded border border-white/25',
                preview.kind === 'zoom-in' ? 'tb-preview-zoom-in' : 'tb-preview-zoom-punch',
              ].join(' ')}
            />
          )}
          {preview.kind === 'vignette' && (
            <div className="absolute inset-0 tb-preview-vignette rounded-lg" />
          )}
          {preview.kind === 'shake' && (
            <span className="text-lg text-white/80 tb-preview-shake">✦</span>
          )}
          {preview.kind === 'color-grade' && (
            <div className="absolute inset-0 tb-preview-color-grade" />
          )}
          {preview.kind === 'sfx' && !preview.previewLabel && (
            <span className="text-lg text-white/90 tb-preview-sfx-pulse">{preview.hint ?? '♪'}</span>
          )}
          {preview.kind === 'default' && preview.hint && !hovering && (
            <span className="text-white/80 text-lg font-bold">{preview.hint}</span>
          )}
          {preview.kind === 'default' && hovering && (
            <span className="text-white/90 text-lg font-bold tb-preview-pulse">{preview.hint}</span>
          )}
        </div>

        {tool.from_template && (
          <span className="absolute top-0.5 right-0.5 text-[8px] bg-violet-600/90 text-white px-1 rounded z-10">
            Template
          </span>
        )}
      </div>
      <span className="text-[10px] text-text-secondary group-hover:text-text-primary text-center leading-tight line-clamp-2 w-full">
        {tool.name}
      </span>
      {tool.description && (
        <span className="text-[9px] text-text-disabled text-center leading-tight line-clamp-2 w-full px-0.5">
          {tool.description}
        </span>
      )}
    </button>
  )
}
