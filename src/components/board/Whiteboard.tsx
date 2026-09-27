'use client'

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type RefObject,
} from 'react'
import { PushPin, X } from '@/components/ui/icons'
import type { CloudinaryRef, SketchBlock } from '@/lib/blocks/schema'
import {
  activePage,
  boardReducer,
  initialBoardState,
  newId,
  pageIsEmpty,
  placeNewFigure,
  sanitizePages,
  type BoardCommand,
  type BoardState,
} from '@/lib/board/model'
import { BoardPainter, figureAspect } from '@/lib/board/render'
import { toSketch } from '@/lib/board/sketch'
import { useBoardInput, type BoardStore } from '@/lib/board/useBoardInput'
import {
  BOARD_H,
  BOARD_W,
  MAX_FIGURES,
  type BoardPage,
  type BoardRect,
  type CardKind,
  type CardPicture,
  type PinnedFigure,
} from '@/lib/board/types'
import { BoardToolbar } from './BoardToolbar'
import { PageStrip } from './PageStrip'

/**
 * What the studio can do with a board it holds a handle to.
 *
 * The recorder draws the board into its own 1280 × 720 frame with paint(),
 * and uses onChange to redraw only when the board changes. The written
 * explanation takes a page as a sketch block with toSketch().
 */
export interface WhiteboardHandle {
  /**
   * Draws the current page, the stroke being drawn and the laser trail into
   * ctx, filling dest (in ctx's current units), from vectors at that size.
   */
  paint(ctx: CanvasRenderingContext2D, dest: BoardRect): void
  /** Called after every change to the picture, at most once a frame. Returns an unsubscribe. */
  onChange(callback: () => void): () => void
  /** Index of the page on show. */
  currentPage(): number
  pages(): BoardPage[]
  /** Replaces every page, e.g. with a saved draft. Malformed input is dropped, not thrown. */
  load(pages: BoardPage[]): void
  /**
   * A page (the current one by default) as a sketch block, simplified and
   * under SKETCH_MAX_BYTES. Throws an Error worded for the teacher when the
   * page is too large.
   */
  toSketch(pageIndex?: number, alt?: string): SketchBlock
  /** Pins an existing question figure onto the current page. Rejects with a message to show. */
  pinFigure(image: CloudinaryRef): Promise<void>
  /** Gives the board the studio's pictures of the question card, so it can show them. */
  setCardImages(cards: Record<CardKind, CardPicture> | null): void
  /**
   * Puts the whole question card on the current page, beneath the ink, large
   * enough to write on — replacing a card already there. Throws a message to
   * show when the card's picture is not ready or the page is full.
   */
  pinCard(kind: CardKind): void
  /** Whether the current page shows the question card. */
  questionOnPage(): boolean
}

/** localStorage keys are `qp-board:<storageKey>`. */
const STORAGE_PREFIX = 'qp-board:'
const SAVE_DELAY_MS = 800

function createBoardStore(): BoardStore {
  let state: BoardState = initialBoardState()
  const listeners = new Set<() => void>()
  return {
    getState: () => state,
    dispatch(command: BoardCommand) {
      const next = boardReducer(state, command)
      if (next === state) return
      state = next
      for (const listener of listeners) listener()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * The teaching whiteboard: pen, highlighter, eraser, laser, shapes, several
 * pages, undo and redo per page, and stylus pressure.
 *
 * The board is always 16:9 and fills the width it is given; className sizes
 * the whole (toolbar, board and page strip). With a storageKey the pages are
 * kept in this browser as they change and restored on the next visit — a
 * convenience only: a full or blocked storage just means nothing is kept.
 */
export function Whiteboard({
  handleRef,
  className = '',
  storageKey, layout = 'stacked' }: {
  /** 'overlay': the toolbar and page strip float over a board that fills its box (full screen). */
  layout?: 'stacked' | 'overlay'
  handleRef?: Ref<WhiteboardHandle>
  className?: string
  storageKey?: string
}) {
  const [store] = useState(createBoardStore)
  const [painter] = useState(() => new BoardPainter(() => activePage(store.getState())))
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [penSeen, setPenSeen] = useState(false)
  const [fingerDraw, setFingerDraw] = useState(false)

  useEffect(() => store.subscribe(painter.invalidate), [store, painter])

  useBoardInput(canvasRef, { store, painter, fingerDraw, onPenSeen: () => setPenSeen(true) })

  useAutosave(store, storageKey)

  useImperativeHandle(
    handleRef,
    (): WhiteboardHandle => ({
      paint: (ctx, dest) => painter.paint(ctx, dest),
      onChange: (callback) => painter.onChange(callback),
      currentPage: () => store.getState().current,
      pages: () => store.getState().pages,
      load: (pages) => store.dispatch({ type: 'load', pages: sanitizePages(pages) ?? [] }),
      toSketch: (pageIndex, alt) => {
        const { pages, current } = store.getState()
        const page = pages[pageIndex ?? current]
        if (!page) throw new Error('There is no such board page.')
        return toSketch(page, alt)
      },
      pinFigure: async (image) => {
        if (image.source_url !== undefined) throw new Error('Only figures already on the site can be pinned.')
        const full = () => activePage(store.getState()).figures.length >= MAX_FIGURES
        const refusal = `A board page holds at most ${MAX_FIGURES} figures. Start a new page for this one.`
        if (full()) throw new Error(refusal)
        const img = await painter.images.load(image)
        // The teacher may have added another while it loaded.
        if (full()) throw new Error(refusal)
        const rect = placeNewFigure(activePage(store.getState()), figureAspect(image, img))
        store.dispatch({ type: 'pinFigure', figure: { id: newId(), image, ...rect } })
      },
      setCardImages: (cards) => painter.images.setCards(cards),
      pinCard: (kind) => {
        const card = painter.images.card(kind)
        if (!card) throw new Error('The question is still being prepared. Try again in a moment.')
        const page = activePage(store.getState())
        // One card per page: choosing the other version swaps it in place.
        const existing = page.figures.find((figure) => figure.card)
        if (existing) {
          store.dispatch({ type: 'unpinFigure', id: existing.id })
        } else if (page.figures.length >= MAX_FIGURES) {
          throw new Error(`A board page holds at most ${MAX_FIGURES} figures. Start a new page for the question.`)
        }
        const after = activePage(store.getState())
        const rect = existing
          ? { x: existing.x, y: existing.y, w: existing.w, h: existing.w / (card.width / card.height) }
          : placeNewFigure(after, card.width / card.height, { maxW: BOARD_W * 0.62, maxH: BOARD_H - 64 })
        store.dispatch({ type: 'pinFigure', figure: { id: newId(), card: kind, ...rect } })
      },
      questionOnPage: () => activePage(store.getState()).figures.some((figure) => figure.card),
    }),
    [store, painter],
  )

  const page = state.pages[state.current]
  const cursor = state.tool === 'eraser' || state.tool === 'laser' ? 'cursor-none' : 'cursor-crosshair'

  // Full screen: the page fills the screen and the toolbar and page strip
  // float over it, so no height goes to anything but the board.
  const overlay = layout === 'overlay'

  return (
    <div className={overlay ? `relative ${className}` : `flex flex-col gap-2 ${className}`}>
      <div className={overlay ? 'absolute top-2 left-1/2 z-10 max-w-[calc(100%-1rem)] -translate-x-1/2 rounded-card bg-surface/95 shadow-[0_6px_24px_-10px_rgba(12,10,9,0.35)]' : ''}>
        <BoardToolbar
          state={state}
          dispatch={store.dispatch}
          penSeen={penSeen}
          fingerDraw={fingerDraw}
          onFingerDrawChange={setFingerDraw}
        />
      </div>

      <div
        ref={stageRef}
        className={`relative aspect-video w-full overflow-hidden bg-white ${overlay ? '' : 'rounded-control border border-rule'}`}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Whiteboard, page ${state.current + 1} of ${state.pages.length}${pageIsEmpty(page) ? ', empty' : ''}`}
          className={`absolute inset-0 block h-full w-full touch-none select-none ${cursor}`}
          style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
        />
        {page.figures.map((figure) => (
          <FigureHandles key={figure.id} figure={figure} dispatch={store.dispatch} stageRef={stageRef} />
        ))}
      </div>

      <div className={overlay ? 'absolute bottom-2 left-1/2 z-10 max-w-[calc(100%-1rem)] -translate-x-1/2 rounded-card bg-surface/95 px-2 shadow-[0_6px_24px_-10px_rgba(12,10,9,0.35)]' : ''}>
        <PageStrip pages={state.pages} current={state.current} images={painter.images} dispatch={store.dispatch} />
      </div>
    </div>
  )
}

/**
 * A board longer than this, as JSON, is not worth emptying other boards for:
 * browsers keep only about 5 MB per site, so it would likely not fit anyway.
 */
const ROOM_WORTH_MAKING = 1_500_000

/**
 * Saves one board, making room if storage is full by dropping the boards of
 * other questions, least recently saved first. Each question keeps its own
 * board, so without this the browser's few megabytes fill up after a few
 * dozen questions and every board after that silently stops being kept.
 */
function saveWithRoom(key: string, json: string): void {
  const write = () => window.localStorage.setItem(key, json)
  try {
    write()
    return
  } catch (error) {
    if (json.length > ROOM_WORTH_MAKING) throw error
    // Most likely full; make room below.
  }
  const others: { key: string; at: number }[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const other = window.localStorage.key(i)
    if (!other?.startsWith(STORAGE_PREFIX) || other === key) continue
    // The save time is written first, so a peek at the start finds it without parsing the whole board.
    const at = /^\{"v":1,"t":(\d+)/.exec(window.localStorage.getItem(other)?.slice(0, 40) ?? '')
    others.push({ key: other, at: at ? Number(at[1]) : 0 })
  }
  others.sort((a, b) => a.at - b.at)
  for (const other of others) {
    window.localStorage.removeItem(other.key)
    try {
      write()
      return
    } catch {
      // Still no room: drop the next oldest.
    }
  }
  throw new Error('This board does not fit in the browser’s storage.')
}

/** Keeps the pages in localStorage as they change, and restores them on mount. */
function useAutosave(store: BoardStore, storageKey: string | undefined) {
  // The board last restored, so a switch to another question's board is noticed.
  const restoredKey = useRef<string | null>(null)

  useEffect(() => {
    if (!storageKey) return
    const key = STORAGE_PREFIX + storageKey
    const switched = restoredKey.current !== null && restoredKey.current !== key
    restoredKey.current = key

    let restored = false
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) {
        const saved = JSON.parse(raw) as { pages?: unknown; current?: unknown }
        const pages = sanitizePages(saved?.pages)
        if (pages) {
          store.dispatch({ type: 'load', pages, current: typeof saved.current === 'number' ? saved.current : 0 })
          restored = true
        }
      }
    } catch {
      // Unreadable or blocked storage: start with a blank board.
    }
    // Another question's board with nothing kept for it: start blank, not with the last one's drawing.
    if (switched && !restored) store.dispatch({ type: 'load', pages: [] })

    let timer = 0
    let { pages: savedPages, current: savedCurrent } = store.getState()
    const save = () => {
      timer = 0
      const { pages, current } = store.getState()
      try {
        if (pages.length === 1 && pageIsEmpty(pages[0])) window.localStorage.removeItem(key)
        // The save time comes first, where saveWithRoom looks for it.
        else saveWithRoom(key, JSON.stringify({ v: 1, t: Date.now(), pages, current }))
      } catch {
        // Too big or blocked: the board still works, it just is not kept.
      }
    }
    const unsubscribe = store.subscribe(() => {
      const { pages, current } = store.getState()
      // Picking a tool or colour changes nothing worth keeping.
      if (pages === savedPages && current === savedCurrent) return
      savedPages = pages
      savedCurrent = current
      window.clearTimeout(timer)
      timer = window.setTimeout(save, SAVE_DELAY_MS)
    })
    const flush = () => {
      if (!timer) return
      window.clearTimeout(timer)
      save()
    }
    // A tablet may discard a background tab without a pagehide: save on the way out of view too.
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      unsubscribe()
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHidden)
      flush()
    }
  }, [store, storageKey])
}

/**
 * Grips for a pinned figure: drag the pin to move it, the corner to resize
 * it, the cross to take it off the page. They are page controls, not part of
 * the picture, so they never appear in a recording or a sketch.
 */
function FigureHandles({
  figure,
  dispatch,
  stageRef,
}: {
  figure: PinnedFigure
  dispatch: (command: BoardCommand) => void
  stageRef: RefObject<HTMLDivElement | null>
}) {
  const start = (mode: 'move' | 'resize') => (event: ReactPointerEvent<HTMLButtonElement>) => {
    const stage = stageRef.current
    if (!stage || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    event.stopPropagation()
    const bounds = stage.getBoundingClientRect()
    const target = event.currentTarget
    const from: BoardRect = { x: figure.x, y: figure.y, w: figure.w, h: figure.h }
    const aspect = from.w / from.h
    const originX = event.clientX
    const originY = event.clientY
    let rect = from
    try {
      target.setPointerCapture(event.pointerId)
    } catch {
      // Without capture the drag stops at the grip's edge.
    }

    const move = (moveEvent: PointerEvent) => {
      const dx = ((moveEvent.clientX - originX) / Math.max(bounds.width, 1)) * BOARD_W
      const dy = ((moveEvent.clientY - originY) / Math.max(bounds.height, 1)) * BOARD_H
      if (mode === 'move') {
        rect = { ...from, x: from.x + dx, y: from.y + dy }
      } else {
        // Figures keep their shape: follow whichever way the corner moved further.
        const grow = Math.abs(dx) >= Math.abs(dy * aspect) ? dx : dy * aspect
        const w = Math.max(24, from.w + grow)
        rect = { ...from, w, h: w / aspect }
      }
      dispatch({ type: 'moveFigure', id: figure.id, rect })
    }
    const end = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', end)
      target.removeEventListener('pointercancel', end)
      dispatch({ type: 'moveFigure', id: figure.id, rect, from })
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', end)
    target.addEventListener('pointercancel', end)
  }

  const nudge = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 40 : 8
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const move = delta[event.key]
    if (!move) return
    event.preventDefault()
    event.stopPropagation()
    const from = { x: figure.x, y: figure.y, w: figure.w, h: figure.h }
    dispatch({ type: 'moveFigure', id: figure.id, rect: { ...from, x: from.x + move[0], y: from.y + move[1] }, from })
  }

  const grip =
    'pointer-events-auto flex touch-none items-center justify-center border border-rule bg-white/90 text-ink-muted opacity-70 transition-opacity hover:text-ink hover:opacity-100 focus-visible:opacity-100'

  // A figure may hang off the board's edge. The grips go on the part still
  // showing, and never past the board, so it can always be taken hold of again.
  const right = `${(Math.min(BOARD_W, figure.x + figure.w) / BOARD_W) * 100}%`
  const top = `${(Math.max(0, figure.y) / BOARD_H) * 100}%`
  const bottom = `${(Math.min(BOARD_H, figure.y + figure.h) / BOARD_H) * 100}%`

  return (
    <>
      {/* Top right: a question's text starts at the left, so the grips hide less of it there. */}
      <div
        className="pointer-events-none absolute flex gap-1"
        style={{
          left: `clamp(0px, calc(${right} - 64px), calc(100% - 64px))`,
          top: `clamp(0px, calc(${top} + 4px), calc(100% - 32px))`,
        }}
      >
        <button
          type="button"
          title={`Drag to move the ${figure.card ? 'question' : 'figure'} (arrow keys nudge it)`}
          aria-label={figure.card ? 'Move the question' : 'Move figure'}
          onPointerDown={start('move')}
          onKeyDown={nudge}
          className={`${grip} h-7 w-7 cursor-move rounded-control`}
        >
          <PushPin size={14} />
        </button>
        <button
          type="button"
          title={`Take the ${figure.card ? 'question' : 'figure'} off the page`}
          aria-label={figure.card ? 'Remove the question' : 'Remove figure'}
          onClick={() => dispatch({ type: 'unpinFigure', id: figure.id })}
          className={`${grip} h-7 w-7 rounded-control`}
        >
          <X size={14} />
        </button>
      </div>
      <button
        type="button"
        title={`Drag to resize the ${figure.card ? 'question' : 'figure'}`}
        aria-label={figure.card ? 'Resize the question' : 'Resize figure'}
        onPointerDown={start('resize')}
        style={{
          left: `clamp(0px, calc(${right} - 20px), calc(100% - 20px))`,
          top: `clamp(0px, calc(${bottom} - 20px), calc(100% - 20px))`,
        }}
        className={`${grip} absolute h-5 w-5 cursor-nwse-resize rounded-tl-control`}
      >
        <span aria-hidden className="block h-2 w-2 border-r-2 border-b-2 border-current" />
      </button>
    </>
  )
}
