'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { CaretDown, CaretUp, Eye, EyeSlash, Plus } from '@/components/ui/icons'
import { formatClock } from '@/lib/studio/filename'
import { FRAME_H, FRAME_W } from '@/lib/studio/compositor'

export type Corner = 'bottom-right' | 'bottom-left' | 'top-right'

const CORNERS: Corner[] = ['bottom-right', 'bottom-left', 'top-right']
const CORNER_CLASS: Record<Corner, string> = {
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-right': 'top-20 right-4',
}
const SIZES = { small: 208, normal: 320, large: 480 } as const
type Size = keyof typeof SIZES

export interface PreviewCard {
  /** A picture of the question is ready (the card shows a "Question 7" tab until then). */
  ready: boolean
  open: boolean
  zoom: number
}

/**
 * Exactly what is being recorded, small, in a corner of the screen: the
 * board, the question card and the webcam bubble as the viewer will see them.
 *
 * It floats rather than sitting in the page, so it is always on screen while
 * recording — Safari may stop producing frames from a canvas that is not —
 * and it can be moved to another corner or shrunk when it covers the board.
 * The card on the recording is steered from here: the wheel (or dragging, or
 * two fingers) scrolls it, Ctrl + wheel (or a pinch) zooms it.
 */
export function OnAirPreview({
  canvasRef,
  shown,
  recording,
  paused,
  elapsedMs,
  count,
  card,
  onToggleCard,
  onZoom,
  onScroll,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  shown: boolean
  recording: boolean
  paused: boolean
  elapsedMs: number
  count: number | null
  card: PreviewCard
  onToggleCard: () => void
  onZoom: (factor: number) => void
  onScroll: (framePx: number) => void
}) {
  const [corner, setCorner] = useState<Corner>('bottom-right')
  const [size, setSize] = useState<Size>('normal')
  const stage = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const handlers = useRef({ onZoom, onScroll })

  useEffect(() => {
    handlers.current = { onZoom, onScroll }
  }, [onZoom, onScroll])

  // The wheel needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const element = stage.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const lines = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 400 : 1
      const delta = event.deltaY * lines
      if (event.ctrlKey || event.metaKey) handlers.current.onZoom(Math.exp(-delta * 0.002))
      else handlers.current.onScroll(delta)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  const toFrame = () => FRAME_W / Math.max(1, stage.current?.getBoundingClientRect().width ?? SIZES[size])

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Without capture a drag ends at the preview's edge.
    }
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    const all = pointers.current
    if (all.size === 1) {
      // One finger or the mouse: drag the card's content, as on a phone.
      handlers.current.onScroll(-(event.clientY - previous.y) * toFrame())
    } else if (all.size === 2) {
      const other = [...all.entries()].find(([id]) => id !== event.pointerId)?.[1]
      if (other) {
        const before = Math.hypot(previous.x - other.x, previous.y - other.y)
        const after = Math.hypot(event.clientX - other.x, event.clientY - other.y)
        if (before > 0 && after > 0) handlers.current.onZoom(after / before)
        // Two fingers moving together scroll by half their movement each.
        handlers.current.onScroll((-(event.clientY - previous.y) / 2) * toFrame())
      }
    }
    all.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }

  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
  }

  const width = SIZES[size]
  const icon = 'flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40'

  return (
    <div
      className={`fixed z-40 ${CORNER_CLASS[corner]} ${shown ? '' : 'hidden'} rounded-card border border-rule bg-surface p-1.5`}
      style={{ width: width + 14 }}
      role="region"
      aria-label="What is being recorded"
    >
      <div
        ref={stage}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        className="relative touch-none select-none overflow-hidden rounded-control border border-rule bg-white"
        style={{ width, height: (width * FRAME_H) / FRAME_W }}
        title="Scroll or drag to move the question card; Ctrl + wheel or pinch to zoom it"
      >
        <canvas ref={canvasRef} width={FRAME_W} height={FRAME_H} className="block h-full w-full" />
        {recording ? (
          <span
            className={`absolute top-1.5 left-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-micro text-white tabular-nums ${
              paused ? 'bg-ink/80' : 'bg-incorrect'
            }`}
          >
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full bg-white ${paused ? '' : 'animate-pulse'}`} />
            {paused ? 'Paused' : 'REC'} {formatClock(elapsedMs)}
          </span>
        ) : null}
        {count !== null ? (
          <span className="absolute inset-0 flex items-center justify-center bg-ink/45 text-[3rem] font-medium text-white tabular-nums">
            {count}
          </span>
        ) : null}
      </div>

      <div className="mt-1 flex items-center gap-0.5">
        <button
          type="button"
          onClick={onToggleCard}
          className={icon}
          aria-pressed={card.open}
          title={card.open ? 'Fold the question card away (Q)' : 'Show the question card (Q)'}
          aria-label={card.open ? 'Fold the question card away' : 'Show the question card'}
        >
          {card.open ? <Eye size={16} /> : <EyeSlash size={16} />}
        </button>
        <button type="button" onClick={() => onZoom(1 / 1.15)} disabled={!card.open} className={icon} title="Zoom the card out" aria-label="Zoom the question card out">
          <span aria-hidden className="text-ui leading-none">−</span>
        </button>
        <span className="w-10 text-center text-micro text-ink-faint tabular-nums">{Math.round(card.zoom * 100)}%</span>
        <button type="button" onClick={() => onZoom(1.15)} disabled={!card.open} className={icon} title="Zoom the card in" aria-label="Zoom the question card in">
          <Plus size={16} />
        </button>
        <button type="button" onClick={() => onScroll(-120)} disabled={!card.open} className={icon} title="Scroll the card up" aria-label="Scroll the question card up">
          <CaretUp size={16} />
        </button>
        <button type="button" onClick={() => onScroll(120)} disabled={!card.open} className={icon} title="Scroll the card down" aria-label="Scroll the question card down">
          <CaretDown size={16} />
        </button>
        {!card.ready ? <span className="ml-1 truncate text-micro text-ink-faint">Preparing card…</span> : null}
        <span className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setSize(size === 'small' ? 'normal' : size === 'normal' ? 'large' : 'small')}
            className={`${icon} w-auto px-1.5 text-micro`}
            title="Change the preview’s size"
            aria-label={`Preview size: ${size}. Change it`}
          >
            {size === 'small' ? 'S' : size === 'normal' ? 'M' : 'L'}
          </button>
          <button
            type="button"
            onClick={() => setCorner(CORNERS[(CORNERS.indexOf(corner) + 1) % CORNERS.length])}
            className={`${icon} w-auto px-1.5 text-micro`}
            title="Move the preview to another corner"
          >
            Move
          </button>
        </span>
      </div>
    </div>
  )
}
