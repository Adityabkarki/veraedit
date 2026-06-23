'use client'

/**
 * ResizeHandle — draggable divider between two panels.
 *
 * Usage:
 *   <ResizeHandle
 *     direction="horizontal"   // drag left/right to resize a column
 *     onResize={(delta) => setWidth(w => clamp(w + delta))}
 *   />
 *   <ResizeHandle
 *     direction="vertical"     // drag up/down to resize a row
 *     onResize={(delta) => setHeight(h => clamp(h - delta))}
 *   />
 *
 * `onResize` receives the raw pixel delta (positive = right/down).
 */

import { useRef, useCallback, useEffect } from 'react'

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical'
  onResize: (delta: number) => void
  className?: string
}

export function ResizeHandle({ direction, onResize, className = '' }: ResizeHandleProps) {
  const dragging = useRef(false)
  const lastPos  = useRef(0)
  const onResizeRef = useRef(onResize)

  useEffect(() => {
    onResizeRef.current = onResize
  }, [onResize])

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragging.current = true
      lastPos.current  = direction === 'horizontal' ? e.clientX : e.clientY

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return
        ev.preventDefault()
        const curr  = direction === 'horizontal' ? ev.clientX : ev.clientY
        const delta = curr - lastPos.current
        lastPos.current = curr
        onResizeRef.current(delta)
      }

      const onMouseUp = () => {
        dragging.current = false
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup',   onMouseUp)
        document.body.style.cursor      = ''
        document.body.style.userSelect  = ''
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup',   onMouseUp)
      document.body.style.cursor     = direction === 'horizontal' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [direction],
  )

  const isH = direction === 'horizontal'

  return (
    <div
      data-testid={`resize-handle-${direction}`}
      role="separator"
      aria-orientation={isH ? 'vertical' : 'horizontal'}
      aria-label={isH ? 'Resize side panels' : 'Resize timeline height'}
      onMouseDown={onMouseDown}
      className={[
        'flex-shrink-0 group relative z-30 self-stretch',
        isH ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize w-full',
        'bg-bg-overlay/80 hover:bg-accent/50 active:bg-accent/60 transition-colors duration-150',
        className,
      ].join(' ')}
    >
      {/* Wider invisible hit target (easier to grab than the 8px bar) */}
      <div
        aria-hidden="true"
        className={[
          'absolute',
          isH ? 'inset-y-0 -left-2 -right-2' : 'inset-x-0 -top-2 -bottom-2',
        ].join(' ')}
      />
      {/* Visual grip indicator */}
      <div
        className={[
          'absolute inset-0 m-auto rounded-full bg-text-disabled/80 group-hover:bg-accent transition-colors duration-150 pointer-events-none',
          isH ? 'w-0.5 h-10' : 'h-0.5 w-10',
        ].join(' ')}
      />
    </div>
  )
}
