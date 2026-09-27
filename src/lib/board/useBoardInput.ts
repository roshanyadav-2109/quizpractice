/**
 * Pointer, keyboard and sizing for the whiteboard canvas.
 *
 * One input model covers mouse, finger and stylus: Pointer Events, captured
 * to the canvas so a stroke keeps going past its edge, with every coalesced
 * sample kept so fast pen strokes stay smooth. A stylus's own pressure is
 * used; a mouse's or finger's is simulated from speed.
 *
 * Palm rejection: until a pen has touched the board, fingers draw. Once one
 * has, fingers stop drawing — a resting palm is ignored, and a finger alone
 * scrolls the page — unless the teacher turns "Draw with finger" back on.
 * A pen that lands while a finger is mid-stroke cancels that stroke, which was
 * almost certainly a palm.
 *
 * Imported only by the Whiteboard client component.
 */
import { useEffect, useRef, type RefObject } from 'react'
import {
  clampToBoard,
  eraserRadius,
  newId,
  simulatedPressure,
  strokeStyle,
  constrainShape,
  activePage,
  type BoardCommand,
  type BoardState,
} from './model'
import type { BoardPainter } from './render'
import { simplifyStroke } from './simplify'
import { BOARD_H, PEN_COLORS, isShapeTool, pageWidth, type ShapeTool } from './types'

export interface BoardStore {
  getState(): BoardState
  dispatch(command: BoardCommand): void
  subscribe(listener: () => void): () => void
}

export interface BoardInputOptions {
  store: BoardStore
  painter: BoardPainter
  /** Fingers draw even after a pen has been used. */
  fingerDraw: boolean
  /** Called the first time a stylus touches the board. */
  onPenSeen: () => void
}

type Gesture =
  | {
      kind: 'ink'
      pointerId: number
      pointerType: string
      tool: 'pen' | 'highlighter'
      color: string
      size: number
      pts: number[]
      pressure: number
      time: number
      realPressure: boolean
      /** The last raw pointer position; pts hold the steadied path. */
      rawX: number
      rawY: number
    }
  | {
      kind: 'shape'
      pointerId: number
      pointerType: string
      tool: ShapeTool
      color: string
      size: number
      x0: number
      y0: number
      x1: number
      y1: number
    }
  | { kind: 'erase'; pointerId: number; pointerType: string; id: string; r: number; x: number; y: number }
  | { kind: 'laser'; pointerId: number; pointerType: string }
  | { kind: 'pan'; pointerId: number; pointerType: string; x: number; y: number; scroller: Element }

/** A finger within this long of the pen lifting is a palm, not a pan. */
const PALM_MS = 500
/** Largest backing store for the on-screen canvas, in device pixels. */
const MAX_BACKING = 4096
/**
 * How far each stored point moves towards the pointer: perfect-freehand's
 * streamline of 0.5 (0.15 + 0.5 × 0.85).
 */
const STREAMLINE = 0.575
/** Commit-time simplification: invisible, but keeps the autosave small. */
const COMMIT_EPSILON = 0.3
const COMMIT_PRESSURE_EPSILON = 0.03

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Pen pressure, lifted a little: a stylus reports light handwriting as
 * 0.1–0.3, which would draw a hairline. Zero means "not reported yet".
 */
function penPressure(event: PointerEvent, previous: number): number {
  if (!(event.pressure > 0)) return previous
  return Math.max(0.05, Math.min(1, Math.pow(event.pressure, 0.75)))
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** Whether a modal dialog is open that the board is not part of. */
function behindModal(element: Element): boolean {
  try {
    const modal = document.querySelector(':modal')
    return modal !== null && !modal.contains(element)
  } catch {
    // A browser without :modal: fall back to any open <dialog>.
    const open = document.querySelector('dialog[open]')
    return open !== null && !open.contains(element)
  }
}

/** The nearest ancestor that scrolls, for a finger panning the page. */
function scrollParent(element: Element): Element {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    const scrolls = /(auto|scroll)/.test(`${style.overflowY} ${style.overflowX}`)
    if (scrolls && (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth)) return node
  }
  return document.scrollingElement ?? document.documentElement
}

/** Samples a pointer event and its coalesced siblings, oldest first. */
function samples(event: PointerEvent): PointerEvent[] {
  const coalesced = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : []
  return coalesced.length ? coalesced : [event]
}

export function useBoardInput(canvasRef: RefObject<HTMLCanvasElement | null>, options: BoardInputOptions): void {
  const { store, painter } = options
  // The toggle and callback change between renders; the listeners read the latest.
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })

  // Shared by the pointer and keyboard handlers.
  const control = useRef<{ cancel: () => void; reshape: (shift: boolean) => void }>({
    cancel: () => {},
    reshape: () => {},
  })

  // -------------------------------------------------------------------------
  // Pointer input and canvas size
  // -------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    painter.attach(canvas)

    let active: Gesture | null = null
    let penSeen = false
    let lastPen = -Infinity
    let rect = canvas.getBoundingClientRect()
    let lastShift = false

    const toBoard = (event: PointerEvent): [number, number] =>
      clampToBoard(
        ((event.clientX - rect.left) / Math.max(rect.width, 1)) * pageWidth(activePage(store.getState())),
        ((event.clientY - rect.top) / Math.max(rect.height, 1)) * BOARD_H,
      )

    const feedback = painter.feedback

    const clearHover = () => {
      feedback.laserHead = null
      if (feedback.eraser && !feedback.eraser.pressed) feedback.eraser = null
      painter.invalidate()
    }

    const shapePoints = (gesture: Extract<Gesture, { kind: 'shape' }>, shift: boolean): number[] =>
      shift
        ? constrainShape(gesture.tool, gesture.x0, gesture.y0, gesture.x1, gesture.y1)
        : [gesture.x0, gesture.y0, gesture.x1, gesture.y1]

    const showShape = (gesture: Extract<Gesture, { kind: 'shape' }>, shift: boolean) => {
      feedback.live = { tool: gesture.tool, color: gesture.color, size: gesture.size, pts: shapePoints(gesture, shift) }
      painter.invalidate()
    }

    /**
     * Adds one pointer sample. The stored point trails the pointer a little
     * (perfect-freehand's streamline, applied once here), which steadies a
     * shaky hand; the lifting point is added as it is, so a stroke ends
     * exactly where the pen left the board.
     */
    const addInkPoint = (gesture: Extract<Gesture, { kind: 'ink' }>, event: PointerEvent, lifting = false) => {
      const [rawX, rawY] = toBoard(event)
      const moved = Math.hypot(rawX - gesture.rawX, rawY - gesture.rawY)
      const elapsed = event.timeStamp - gesture.time
      if (gesture.realPressure) {
        gesture.pressure = penPressure(event, gesture.pressure)
      } else if (moved > 0) {
        gesture.pressure = simulatedPressure(gesture.pressure, moved, elapsed, gesture.size)
      }
      gesture.rawX = rawX
      gesture.rawY = rawY
      gesture.time = event.timeStamp

      const count = gesture.pts.length
      const lastX = gesture.pts[count - 3]
      const lastY = gesture.pts[count - 2]
      const x = lifting ? rawX : lastX + (rawX - lastX) * STREAMLINE
      const y = lifting ? rawY : lastY + (rawY - lastY) * STREAMLINE
      // A repeat of the last point adds nothing but weight.
      if (Math.hypot(x - lastX, y - lastY) < 0.2 && Math.abs(gesture.pressure - gesture.pts[count - 1]) < 0.02) return
      gesture.pts.push(x, y, gesture.pressure)
    }

    const eraseTo = (gesture: Extract<Gesture, { kind: 'erase' }>, x: number, y: number) => {
      // Sample along the path so a fast swipe does not skip over thin strokes.
      const distance = Math.hypot(x - gesture.x, y - gesture.y)
      const steps = Math.max(1, Math.ceil(distance / Math.max(2, gesture.r / 2)))
      for (let i = 1; i <= steps; i++) {
        store.dispatch({
          type: 'eraseAt',
          x: gesture.x + ((x - gesture.x) * i) / steps,
          y: gesture.y + ((y - gesture.y) * i) / steps,
          r: gesture.r,
          gesture: gesture.id,
        })
      }
      gesture.x = x
      gesture.y = y
      feedback.eraser = { x, y, r: gesture.r, pressed: true }
      painter.invalidate()
    }

    const laserTo = (event: PointerEvent) => {
      const now = performance.now()
      for (const sample of samples(event)) {
        const [x, y] = toBoard(sample)
        feedback.laser.push({ x, y, t: now })
        feedback.laserHead = { x, y }
      }
      painter.invalidate()
    }

    const finish = (commit: boolean) => {
      const gesture = active
      active = null
      if (!gesture) return
      if (gesture.pointerType === 'pen') lastPen = performance.now()

      if (gesture.kind === 'ink') {
        feedback.live = null
        if (commit && gesture.pts.length >= 3) {
          const pts = simplifyStroke(gesture.pts, COMMIT_EPSILON, COMMIT_PRESSURE_EPSILON).map(round2)
          store.dispatch({
            type: 'addStroke',
            stroke: { id: newId(), tool: gesture.tool, color: gesture.color, size: gesture.size, pts },
          })
        }
      } else if (gesture.kind === 'shape') {
        feedback.live = null
        const pts = shapePoints(gesture, lastShift).map(round2)
        // A click with a shape tool is not a shape.
        if (commit && Math.hypot(pts[2] - pts[0], pts[3] - pts[1]) >= 2) {
          store.dispatch({
            type: 'addStroke',
            stroke: { id: newId(), tool: gesture.tool, color: gesture.color, size: gesture.size, pts },
          })
        }
      } else if (gesture.kind === 'erase') {
        // A mouse or hovering pen keeps its ring; a finger lifts away.
        feedback.eraser =
          gesture.pointerType === 'touch' ? null : { x: gesture.x, y: gesture.y, r: gesture.r, pressed: false }
      } else if (gesture.kind === 'laser') {
        if (gesture.pointerType === 'touch') feedback.laserHead = null
      }
      painter.invalidate()
    }

    control.current = {
      cancel: () => finish(false),
      reshape: (shift: boolean) => {
        lastShift = shift
        if (active?.kind === 'shape') showShape(active, shift)
      },
    }

    const onPointerDown = (event: PointerEvent) => {
      const now = performance.now()
      if (event.pointerType === 'pen') {
        if (!penSeen) {
          penSeen = true
          latest.current.onPenSeen()
        }
        lastPen = now
        // A pen landing while a finger draws: the finger was a palm.
        if (active?.pointerType === 'touch') finish(false)
      }
      // One pointer draws at a time.
      if (active) return
      // Right-click, and a stylus's barrel button, do nothing here.
      if (event.button !== 0 && event.button !== 5) return

      rect = canvas.getBoundingClientRect()
      lastShift = event.shiftKey

      if (event.pointerType === 'touch' && penSeen && !latest.current.fingerDraw) {
        // A palm resting while writing is ignored outright; a finger on its own scrolls.
        if (now - lastPen < PALM_MS) return
        event.preventDefault()
        try {
          canvas.setPointerCapture(event.pointerId)
        } catch {
          // Without capture the pan ends when the finger leaves the board.
        }
        active = {
          kind: 'pan',
          pointerId: event.pointerId,
          pointerType: 'touch',
          x: event.clientX,
          y: event.clientY,
          scroller: scrollParent(canvas),
        }
        return
      }

      event.preventDefault()
      try {
        canvas.setPointerCapture(event.pointerId)
      } catch {
        // The pointer may already be gone; the stroke still works while it is over the canvas.
      }

      const state = store.getState()
      // The eraser end of a stylus erases whatever tool is chosen.
      const tool = event.pointerType === 'pen' && (event.button === 5 || event.buttons & 32) ? 'eraser' : state.tool
      const [x, y] = toBoard(event)

      if (tool === 'pen' || tool === 'highlighter') {
        const { color, size } = strokeStyle(state, tool)
        const realPressure = event.pointerType === 'pen'
        const pressure = realPressure ? penPressure(event, 0.5) : 0.5
        const gesture: Gesture = {
          kind: 'ink',
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          tool,
          color,
          size,
          pts: [x, y, pressure],
          pressure,
          time: event.timeStamp,
          realPressure,
          rawX: x,
          rawY: y,
        }
        active = gesture
        feedback.live = { tool, color, size, pts: gesture.pts }
        painter.invalidate()
      } else if (isShapeTool(tool)) {
        const { color, size } = strokeStyle(state, tool)
        const gesture: Gesture = {
          kind: 'shape',
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          tool,
          color,
          size,
          x0: x,
          y0: y,
          x1: x,
          y1: y,
        }
        active = gesture
        showShape(gesture, lastShift)
      } else if (tool === 'eraser') {
        const gesture: Gesture = {
          kind: 'erase',
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          id: newId(),
          r: eraserRadius(state),
          x,
          y,
        }
        active = gesture
        eraseTo(gesture, x, y)
      } else {
        active = { kind: 'laser', pointerId: event.pointerId, pointerType: event.pointerType }
        laserTo(event)
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!active) {
        // Hovering: a mouse or a hovering stylus shows the laser dot or the eraser ring.
        if (event.pointerType === 'touch') return
        const tool = store.getState().tool
        if (tool === 'laser') {
          rect = canvas.getBoundingClientRect()
          laserTo(event)
        } else if (tool === 'eraser') {
          rect = canvas.getBoundingClientRect()
          const [x, y] = toBoard(event)
          feedback.eraser = { x, y, r: eraserRadius(store.getState()), pressed: false }
          painter.invalidate()
        }
        return
      }
      if (event.pointerId !== active.pointerId) return
      const gesture = active

      switch (gesture.kind) {
        case 'ink':
          for (const sample of samples(event)) addInkPoint(gesture, sample)
          painter.invalidate()
          break
        case 'shape': {
          const [x, y] = toBoard(event)
          gesture.x1 = x
          gesture.y1 = y
          lastShift = event.shiftKey
          showShape(gesture, lastShift)
          break
        }
        case 'erase':
          for (const sample of samples(event)) {
            const [x, y] = toBoard(sample)
            eraseTo(gesture, x, y)
          }
          break
        case 'laser':
          laserTo(event)
          break
        case 'pan':
          gesture.scroller.scrollBy(gesture.x - event.clientX, gesture.y - event.clientY)
          gesture.x = event.clientX
          gesture.y = event.clientY
          break
      }
    }

    const onPointerUp = (event: PointerEvent) => {
      if (!active || event.pointerId !== active.pointerId) return
      // The lifting position can differ from the last move.
      if (active.kind === 'ink') addInkPoint(active, event, true)
      finish(true)
    }

    // Capture lost without a pointerup (the canvas was hidden, say): keep the
    // stroke, but not this event's position, which browsers do not agree on.
    const onLostCapture = (event: PointerEvent) => {
      if (active && event.pointerId === active.pointerId) finish(true)
    }

    const onPointerCancel = (event: PointerEvent) => {
      if (!active || event.pointerId !== active.pointerId) return
      // A cancelled touch is usually a palm or a system gesture; a pen or mouse
      // stroke that was cut short is kept.
      finish(event.pointerType !== 'touch')
    }

    const onPointerLeave = (event: PointerEvent) => {
      if (!active && event.pointerType !== 'touch') clearHover()
    }

    // iOS shows a magnifier or selects on a long press unless touches are cancelled.
    const onTouch = (event: TouchEvent) => event.preventDefault()
    const onContextMenu = (event: Event) => event.preventDefault()

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerCancel)
    canvas.addEventListener('lostpointercapture', onLostCapture)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('touchstart', onTouch, { passive: false })
    canvas.addEventListener('touchmove', onTouch, { passive: false })
    canvas.addEventListener('contextmenu', onContextMenu)

    // The tool changed: drop hover feedback that belonged to the old one.
    let lastTool = store.getState().tool
    const unsubscribe = store.subscribe(() => {
      const tool = store.getState().tool
      if (tool === lastTool) return
      lastTool = tool
      if (tool !== 'laser') feedback.laserHead = null
      if (tool !== 'eraser' && !feedback.eraser?.pressed) feedback.eraser = null
      painter.invalidate()
    })

    // ---- Size: CSS size × devicePixelRatio, exactly when the browser can say ----
    const applySize = (width: number, height: number) => {
      const scale = Math.min(1, MAX_BACKING / Math.max(width, height, 1))
      painter.resize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)))
      rect = canvas.getBoundingClientRect()
    }
    const fromCss = () => {
      const ratio = window.devicePixelRatio || 1
      applySize(Math.round(canvas.clientWidth * ratio), Math.round(canvas.clientHeight * ratio))
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      const device = entry?.devicePixelContentBoxSize?.[0]
      if (device) applySize(device.inlineSize, device.blockSize)
      else fromCss()
    })
    try {
      observer.observe(canvas, { box: 'device-pixel-content-box' })
    } catch {
      // Safari: no device-pixel box. Fall back to CSS pixels × devicePixelRatio.
      observer.observe(canvas)
    }

    // Moving to a screen with another pixel ratio, or zooming the page.
    let media: MediaQueryList | null = null
    const watchRatio = () => {
      media?.removeEventListener('change', onRatio)
      media = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      media.addEventListener('change', onRatio)
    }
    function onRatio() {
      fromCss()
      watchRatio()
    }
    watchRatio()
    fromCss()

    return () => {
      finish(false)
      control.current = { cancel: () => {}, reshape: () => {} }
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      canvas.removeEventListener('lostpointercapture', onLostCapture)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('touchstart', onTouch)
      canvas.removeEventListener('touchmove', onTouch)
      canvas.removeEventListener('contextmenu', onContextMenu)
      unsubscribe()
      observer.disconnect()
      media?.removeEventListener('change', onRatio)
      painter.detach()
    }
  }, [canvasRef, store, painter])

  // -------------------------------------------------------------------------
  // Keyboard shortcuts. Every one also has a toolbar button, for the iPad.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') control.current.reshape(true)
      const canvas = canvasRef.current
      // Only while the board is on screen, and never while typing.
      if (!canvas || event.defaultPrevented || !canvas.getClientRects().length || isEditable(event.target)) return
      // Nor while a dialog is open over the board (an enlarged figure, a confirmation).
      if (behindModal(canvas)) return

      const run = (command: BoardCommand) => {
        event.preventDefault()
        store.dispatch(command)
      }
      const key = event.key.toLowerCase()

      if (event.ctrlKey || event.metaKey) {
        if (event.altKey) return
        if (key === 'z') run({ type: event.shiftKey ? 'redo' : 'undo' })
        else if (key === 'y' && !event.shiftKey) run({ type: 'redo' })
        return
      }
      if (event.altKey) return

      const state = store.getState()
      switch (key) {
        case 'p':
          return run({ type: 'setTool', tool: 'pen' })
        case 'h':
          return run({ type: 'setTool', tool: 'highlighter' })
        case 'e':
          return run({ type: 'setTool', tool: 'eraser' })
        case 'l':
          return run({ type: 'setTool', tool: 'laser' })
        case 's':
          return run({ type: 'cycleShape' })
        case 'n':
          if (!event.repeat) run({ type: 'addPage' })
          return
        case '[':
          return run({ type: 'stepSize', delta: -1 })
        case ']':
          return run({ type: 'stepSize', delta: 1 })
        case 'pagedown':
          return run({ type: 'goto', index: state.current + 1 })
        case 'pageup':
          return run({ type: 'goto', index: state.current - 1 })
        case 'escape':
          control.current.cancel()
          return
      }
      const digit = Number(event.key)
      if (Number.isInteger(digit) && digit >= 1 && digit <= PEN_COLORS.length) {
        run({ type: 'setColor', index: digit - 1 })
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') control.current.reshape(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [canvasRef, store])
}
