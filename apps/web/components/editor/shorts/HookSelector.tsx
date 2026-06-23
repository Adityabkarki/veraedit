'use client'

/**
 * HookSelector — pick or edit the hook text for a short clip.
 *
 * Shows 5 radio-button options. "Edit" switches the active hook
 * to an inline textarea for custom input.
 */

import { useState, useRef, useEffect } from 'react'
import { useShortsStore } from '@/stores/shortsStore'
import type { Short } from '@/stores/shortsStore'

interface HookSelectorProps {
  short:      Short
  onClose?:   () => void
}

export function HookSelector({ short, onClose }: HookSelectorProps) {
  const { setActiveHook, setCustomHook } = useShortsStore()
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editText,     setEditText]     = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeIndex = short.hooks.indexOf(short.activeHook)

  useEffect(() => {
    if (editingIndex !== null) {
      setEditText(short.hooks[editingIndex] ?? '')
      textareaRef.current?.focus()
      textareaRef.current?.select()
    }
  }, [editingIndex, short.hooks])

  const commitEdit = () => {
    if (editingIndex !== null && editText.trim()) {
      setCustomHook(short.id, editText.trim())
    }
    setEditingIndex(null)
  }

  return (
    <div
      data-testid={`hook-selector-${short.id}`}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
          Hook options
        </p>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close hook selector"
            className="text-text-disabled hover:text-text-secondary text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {short.hooks.map((hook, i) => {
        const isActive = i === activeIndex || short.activeHook === hook

        if (editingIndex === i) {
          return (
            <div key={i} className="flex flex-col gap-1">
              <textarea
                ref={textareaRef}
                data-testid={`hook-edit-input-${short.id}`}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit() }
                  if (e.key === 'Escape') { setEditingIndex(null) }
                }}
                className="w-full text-xs p-2 rounded-lg bg-bg-overlay border border-accent
                           text-text-primary placeholder:text-text-disabled outline-none
                           resize-none leading-snug"
                rows={2}
              />
              <div className="flex gap-1">
                <button
                  onClick={commitEdit}
                  className="text-[10px] px-2 py-0.5 rounded bg-accent text-white"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingIndex(null)}
                  className="text-[10px] px-2 py-0.5 rounded text-text-disabled hover:text-text-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )
        }

        return (
          <div
            key={i}
            className={[
              'flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors group',
              isActive
                ? 'bg-accent/10 border border-accent/30'
                : 'hover:bg-bg-overlay border border-transparent',
            ].join(' ')}
            onClick={() => setActiveHook(short.id, i)}
          >
            {/* Radio dot */}
            <div
              data-testid={`hook-option-${short.id}-${i}`}
              aria-selected={isActive}
              className={[
                'mt-0.5 w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 transition-colors',
                isActive
                  ? 'border-accent bg-accent'
                  : 'border-text-disabled group-hover:border-text-secondary',
              ].join(' ')}
            />

            {/* Hook text */}
            <span className={`flex-1 text-xs leading-snug ${isActive ? 'text-text-primary' : 'text-text-secondary'}`}>
              {hook}
            </span>

            {/* Edit button */}
            <button
              data-testid={`hook-edit-${short.id}-${i}`}
              onClick={(e) => { e.stopPropagation(); setEditingIndex(i) }}
              aria-label={`Edit hook ${i + 1}`}
              className="opacity-0 group-hover:opacity-100 text-text-disabled hover:text-text-secondary text-[10px] flex-shrink-0 transition-opacity"
            >
              ✎
            </button>
          </div>
        )
      })}
    </div>
  )
}
