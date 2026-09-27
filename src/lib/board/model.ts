/**
 * The whiteboard's state and every change to it, as one pure reducer.
 *
 * Pages hold finished strokes and pinned figures. Each page keeps its own
 * undo and redo stacks, so undoing on page 3 never reaches back into page 1.
 * State is never mutated: a change returns new arrays and objects, and a
 * command that changes nothing returns the state it was given, so the
 * renderer and React can tell "changed" from "not changed" by identity.
 *
 * What is drawn but not yet finished — the stroke under the pen, the laser
 * trail — is not state. The pointer input holds it and the renderer draws it
 * on top; only a finished stroke becomes a command.
 */
import { cloudinaryRefSchema } from '@/lib/blocks/schema'
import {
  BACKGROUNDS,
  BOARD_H,
  BOARD_W,
  ERASER_SIZES,
  HIGHLIGHTER_COLORS,
  HIGHLIGHTER_SIZES,
  MAX_FIGURES,
  MAX_HISTORY,
  MAX_PAGES,
  PEN_COLORS,
  PEN_SIZES,
  SHAPE_TOOLS,
  isFreehandTool,
  isShapeTool,
  type BoardBackground,
  type BoardPage,
  type BoardRect,
  type InkTool,
  type PinnedFigure,
  type ShapeTool,
  type Stroke,
  type Tool,
} from './types'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** A colour and a width, as indexes into the tool's palette and sizes. */
export interface ToolStyle {
  color: number
  size: number
}

type HistoryEntry =
  | { kind: 'add'; stroke: Stroke }
  | { kind: 'erase'; gesture: string; removed: { stroke: Stroke; index: number }[] }
  | { kind: 'clear'; strokes: Stroke[]; figures: PinnedFigure[] }
  | { kind: 'bg'; from: BoardBackground; to: BoardBackground }
  | { kind: 'pin'; figure: PinnedFigure }
  | { kind: 'unpin'; figure: PinnedFigure; index: number }
  | { kind: 'move'; id: string; from: BoardRect; to: BoardRect }

export interface PageHistory {
  undo: HistoryEntry[]
  redo: HistoryEntry[]
}

export interface BoardState {
  pages: BoardPage[]
  /** Index of the page on show. */
  current: number
  tool: Tool
  /** The shape the Shapes button picks. */
  shape: ShapeTool
  /** Pen and shapes share a style; the highlighter has its own palette. */
  pen: ToolStyle
  highlighter: ToolStyle
  eraserSize: number
  /** Keyed by page id. A page with no entry has nothing to undo. */
  history: Record<string, PageHistory>
}

const EMPTY_HISTORY: PageHistory = { undo: [], redo: [] }

let idCounter = 0

/**
 * A short unique id. crypto.randomUUID is missing outside secure contexts (a
 * tablet reaching a dev server by LAN address), so this does not rely on it.
 */
export function newId(): string {
  idCounter = (idCounter + 1) % 1_679_616
  return `${Date.now().toString(36)}${idCounter.toString(36).padStart(4, '0')}${Math.random().toString(36).slice(2, 6)}`
}

export function emptyPage(bg: BoardBackground = 'plain'): BoardPage {
  return { id: newId(), bg, strokes: [], figures: [] }
}

export function initialBoardState(pages?: BoardPage[]): BoardState {
  return {
    pages: pages?.length ? pages : [emptyPage()],
    current: 0,
    tool: 'pen',
    shape: 'line',
    pen: { color: 0, size: 1 },
    highlighter: { color: 0, size: 1 },
    eraserSize: 1,
    history: {},
  }
}

export function activePage(state: BoardState): BoardPage {
  return state.pages[state.current]
}

function pageHistory(state: BoardState, pageId: string): PageHistory {
  return state.history[pageId] ?? EMPTY_HISTORY
}

export function canUndo(state: BoardState): boolean {
  return pageHistory(state, activePage(state).id).undo.length > 0
}

export function canRedo(state: BoardState): boolean {
  return pageHistory(state, activePage(state).id).redo.length > 0
}

export function pageIsEmpty(page: BoardPage): boolean {
  return page.strokes.length === 0 && page.figures.length === 0
}

/** Which palette a tool draws from: shapes share the pen's. */
export function styleFamily(tool: Tool): 'pen' | 'highlighter' | 'eraser' | null {
  if (tool === 'highlighter') return 'highlighter'
  if (tool === 'pen' || isShapeTool(tool)) return 'pen'
  if (tool === 'eraser') return 'eraser'
  return null
}

/** The colour and width a new stroke with this tool gets. */
export function strokeStyle(state: BoardState, tool: InkTool): { color: string; size: number } {
  if (tool === 'highlighter') {
    return {
      color: HIGHLIGHTER_COLORS[state.highlighter.color] ?? HIGHLIGHTER_COLORS[0],
      size: HIGHLIGHTER_SIZES[state.highlighter.size] ?? HIGHLIGHTER_SIZES[1],
    }
  }
  return { color: PEN_COLORS[state.pen.color] ?? PEN_COLORS[0], size: PEN_SIZES[state.pen.size] ?? PEN_SIZES[1] }
}

export function eraserRadius(state: BoardState): number {
  return ERASER_SIZES[state.eraserSize] ?? ERASER_SIZES[1]
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export type BoardCommand =
  | { type: 'setTool'; tool: Tool }
  /** The S shortcut: pick the shapes, or move to the next shape. */
  | { type: 'cycleShape' }
  /** A palette index for the current tool; on the eraser or laser, picks the pen. */
  | { type: 'setColor'; index: number }
  | { type: 'setSize'; index: number }
  | { type: 'stepSize'; delta: 1 | -1 }
  | { type: 'addStroke'; stroke: Stroke }
  /**
   * Removes every stroke within r of (x, y). All the calls made during one
   * drag share a gesture id, so a single undo brings back the lot.
   */
  | { type: 'eraseAt'; x: number; y: number; r: number; gesture: string }
  | { type: 'clearPage' }
  | { type: 'addPage' }
  | { type: 'deletePage'; index?: number }
  | { type: 'goto'; index: number }
  | { type: 'setBg'; bg: BoardBackground }
  | { type: 'pinFigure'; figure: PinnedFigure }
  /**
   * Moves or resizes a figure. While dragging, send it without `from`: the
   * page follows the hand but no undo step is made. On release, send the
   * starting rect as `from` and the move becomes one undo step.
   */
  | { type: 'moveFigure'; id: string; rect: BoardRect; from?: BoardRect }
  | { type: 'unpinFigure'; id: string }
  | { type: 'undo' }
  | { type: 'redo' }
  /** Replaces every page (a restored autosave, a saved draft). History starts afresh. */
  | { type: 'load'; pages: BoardPage[]; current?: number }

export function boardReducer(state: BoardState, command: BoardCommand): BoardState {
  switch (command.type) {
    case 'setTool':
      if (state.tool === command.tool) return state
      return { ...state, tool: command.tool, shape: isShapeTool(command.tool) ? command.tool : state.shape }

    case 'cycleShape': {
      const shape = isShapeTool(state.tool)
        ? SHAPE_TOOLS[(SHAPE_TOOLS.indexOf(state.tool) + 1) % SHAPE_TOOLS.length]
        : state.shape
      return { ...state, tool: shape, shape }
    }

    case 'setColor': {
      const family = styleFamily(state.tool)
      if (family === 'highlighter') {
        if (!inRange(command.index, HIGHLIGHTER_COLORS.length)) return state
        return { ...state, highlighter: { ...state.highlighter, color: command.index } }
      }
      if (!inRange(command.index, PEN_COLORS.length)) return state
      // A colour chosen with the eraser or laser in hand means "draw now".
      return { ...state, tool: family === 'pen' ? state.tool : 'pen', pen: { ...state.pen, color: command.index } }
    }

    case 'setSize':
      return withSize(state, command.index)

    case 'stepSize': {
      const family = styleFamily(state.tool)
      const current =
        family === 'highlighter' ? state.highlighter.size : family === 'eraser' ? state.eraserSize : state.pen.size
      return withSize(state, current + command.delta)
    }

    case 'addStroke':
      return record(state, { kind: 'add', stroke: command.stroke })

    case 'eraseAt':
      return eraseAt(state, command)

    case 'clearPage': {
      const page = activePage(state)
      if (pageIsEmpty(page)) return state
      return record(state, { kind: 'clear', strokes: page.strokes, figures: page.figures })
    }

    case 'addPage': {
      if (state.pages.length >= MAX_PAGES) return state
      const at = state.current + 1
      const pages = [...state.pages]
      // A new page keeps the ruling of the one before it.
      pages.splice(at, 0, emptyPage(activePage(state).bg))
      return { ...state, pages, current: at }
    }

    case 'deletePage': {
      const index = command.index ?? state.current
      if (state.pages.length <= 1 || !inRange(index, state.pages.length)) return state
      const removed = state.pages[index]
      const pages = state.pages.filter((_, i) => i !== index)
      const history = { ...state.history }
      delete history[removed.id]
      let current = state.current
      if (index < current || current >= pages.length) current -= 1
      return { ...state, pages, current: Math.max(0, current), history }
    }

    case 'goto': {
      const index = Math.max(0, Math.min(state.pages.length - 1, Math.trunc(command.index)))
      return index === state.current ? state : { ...state, current: index }
    }

    case 'setBg': {
      const page = activePage(state)
      if (page.bg === command.bg || !BACKGROUNDS.includes(command.bg)) return state
      return record(state, { kind: 'bg', from: page.bg, to: command.bg })
    }

    case 'pinFigure':
      if (activePage(state).figures.length >= MAX_FIGURES) return state
      return record(state, { kind: 'pin', figure: command.figure })

    case 'moveFigure': {
      const page = activePage(state)
      const figure = page.figures.find((item) => item.id === command.id)
      if (!figure) return state
      const rect = normaliseRect(command.rect)
      if (command.from) {
        const from = normaliseRect(command.from)
        if (sameRect(from, rect)) return sameRect(figure, rect) ? state : replacePage(state, placeFigure(page, command.id, rect))
        return record(replacePage(state, placeFigure(page, command.id, from)), {
          kind: 'move',
          id: command.id,
          from,
          to: rect,
        })
      }
      return sameRect(figure, rect) ? state : replacePage(state, placeFigure(page, command.id, rect))
    }

    case 'unpinFigure': {
      const page = activePage(state)
      const index = page.figures.findIndex((item) => item.id === command.id)
      if (index === -1) return state
      return record(state, { kind: 'unpin', figure: page.figures[index], index })
    }

    case 'undo': {
      const page = activePage(state)
      const stacks = pageHistory(state, page.id)
      const entry = stacks.undo.at(-1)
      if (!entry) return state
      return {
        ...replacePage(state, revert(page, entry)),
        history: { ...state.history, [page.id]: { undo: stacks.undo.slice(0, -1), redo: [...stacks.redo, entry] } },
      }
    }

    case 'redo': {
      const page = activePage(state)
      const stacks = pageHistory(state, page.id)
      const entry = stacks.redo.at(-1)
      if (!entry) return state
      return {
        ...replacePage(state, apply(page, entry)),
        history: { ...state.history, [page.id]: { undo: [...stacks.undo, entry], redo: stacks.redo.slice(0, -1) } },
      }
    }

    case 'load': {
      const pages = command.pages.length ? command.pages.slice(0, MAX_PAGES) : [emptyPage()]
      const current = Math.max(0, Math.min(pages.length - 1, command.current ?? 0))
      return { ...state, pages, current, history: {} }
    }
  }
}

function inRange(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < length
}

function withSize(state: BoardState, index: number): BoardState {
  const family = styleFamily(state.tool)
  if (family === 'eraser') {
    return inRange(index, ERASER_SIZES.length) && index !== state.eraserSize ? { ...state, eraserSize: index } : state
  }
  if (family === 'highlighter') {
    return inRange(index, HIGHLIGHTER_SIZES.length) && index !== state.highlighter.size
      ? { ...state, highlighter: { ...state.highlighter, size: index } }
      : state
  }
  if (family === 'pen') {
    return inRange(index, PEN_SIZES.length) && index !== state.pen.size
      ? { ...state, pen: { ...state.pen, size: index } }
      : state
  }
  return state
}

function replacePage(state: BoardState, page: BoardPage): BoardState {
  if (page === activePage(state)) return state
  const pages = [...state.pages]
  pages[state.current] = page
  return { ...state, pages }
}

/** Applies a new change to the current page and makes it the latest undo step. */
function record(state: BoardState, entry: HistoryEntry): BoardState {
  const page = activePage(state)
  const stacks = pageHistory(state, page.id)
  const undo = [...stacks.undo, entry]
  if (undo.length > MAX_HISTORY) undo.splice(0, undo.length - MAX_HISTORY)
  return {
    ...replacePage(state, apply(page, entry)),
    history: { ...state.history, [page.id]: { undo, redo: [] } },
  }
}

/** Does (or redoes) one history entry. */
function apply(page: BoardPage, entry: HistoryEntry): BoardPage {
  switch (entry.kind) {
    case 'add':
      return { ...page, strokes: [...page.strokes, entry.stroke] }
    case 'erase': {
      const gone = new Set(entry.removed.map((item) => item.stroke.id))
      return { ...page, strokes: page.strokes.filter((stroke) => !gone.has(stroke.id)) }
    }
    case 'clear':
      return { ...page, strokes: [], figures: [] }
    case 'bg':
      return { ...page, bg: entry.to }
    case 'pin':
      return { ...page, figures: [...page.figures, entry.figure] }
    case 'unpin':
      return { ...page, figures: page.figures.filter((item) => item.id !== entry.figure.id) }
    case 'move':
      return placeFigure(page, entry.id, entry.to)
  }
}

/** Undoes one history entry. */
function revert(page: BoardPage, entry: HistoryEntry): BoardPage {
  switch (entry.kind) {
    case 'add':
      return { ...page, strokes: page.strokes.filter((stroke) => stroke.id !== entry.stroke.id) }
    case 'erase': {
      // Each index was recorded against the page as it stood at that moment,
      // so putting them back newest-first restores the original order.
      const strokes = [...page.strokes]
      for (let i = entry.removed.length - 1; i >= 0; i--) {
        const { stroke, index } = entry.removed[i]
        strokes.splice(Math.min(index, strokes.length), 0, stroke)
      }
      return { ...page, strokes }
    }
    case 'clear':
      return { ...page, strokes: entry.strokes, figures: entry.figures }
    case 'bg':
      return { ...page, bg: entry.from }
    case 'pin':
      return { ...page, figures: page.figures.filter((item) => item.id !== entry.figure.id) }
    case 'unpin': {
      const figures = [...page.figures]
      figures.splice(Math.min(entry.index, figures.length), 0, entry.figure)
      return { ...page, figures }
    }
    case 'move':
      return placeFigure(page, entry.id, entry.from)
  }
}

function eraseAt(state: BoardState, command: Extract<BoardCommand, { type: 'eraseAt' }>): BoardState {
  const page = activePage(state)
  const removed: { stroke: Stroke; index: number }[] = []
  const strokes: Stroke[] = []
  for (const stroke of page.strokes) {
    if (strokeHit(stroke, command.x, command.y, command.r)) {
      // The index this stroke had once the ones before it were gone.
      removed.push({ stroke, index: strokes.length })
    } else {
      strokes.push(stroke)
    }
  }
  if (!removed.length) return state

  const stacks = pageHistory(state, page.id)
  const last = stacks.undo.at(-1)
  const nextPage = { ...page, strokes }
  if (last?.kind === 'erase' && last.gesture === command.gesture) {
    // The same drag: one undo step for everything it rubbed out.
    const merged: HistoryEntry = { ...last, removed: [...last.removed, ...removed] }
    return {
      ...replacePage(state, nextPage),
      history: { ...state.history, [page.id]: { undo: [...stacks.undo.slice(0, -1), merged], redo: [] } },
    }
  }
  const undo = [...stacks.undo, { kind: 'erase', gesture: command.gesture, removed } satisfies HistoryEntry]
  if (undo.length > MAX_HISTORY) undo.splice(0, undo.length - MAX_HISTORY)
  return { ...replacePage(state, nextPage), history: { ...state.history, [page.id]: { undo, redo: [] } } }
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

/** Smallest a figure may be resized to, in board units. */
const MIN_FIGURE = 24

function normaliseRect(rect: BoardRect): BoardRect {
  const w = Math.max(MIN_FIGURE, Math.min(BOARD_W * 2, rect.w))
  const h = Math.max(MIN_FIGURE, Math.min(BOARD_H * 2, rect.h))
  // At least a corner stays on the board, so a figure can always be grabbed back.
  const x = Math.max(-w + MIN_FIGURE, Math.min(BOARD_W - MIN_FIGURE, rect.x))
  const y = Math.max(-h + MIN_FIGURE, Math.min(BOARD_H - MIN_FIGURE, rect.y))
  return { x: round2(x), y: round2(y), w: round2(w), h: round2(h) }
}

function sameRect(a: BoardRect, b: BoardRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

function placeFigure(page: BoardPage, id: string, rect: BoardRect): BoardPage {
  return {
    ...page,
    figures: page.figures.map((item) =>
      item.id === id ? { ...item, x: rect.x, y: rect.y, w: rect.w, h: rect.h } : item,
    ),
  }
}

/**
 * Where a newly pinned figure goes: fitted into the left half of the board,
 * keeping its shape, in the highest spot down the left side that no other
 * figure covers — or, when there is none, stepped down and right from the
 * top so none hides another exactly.
 */
export function placeNewFigure(
  page: BoardPage,
  aspect: number,
  { maxW = BOARD_W * 0.5, maxH = BOARD_H * 0.6 }: { maxW?: number; maxH?: number } = {},
): BoardRect {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 4 / 3
  const margin = 32
  let w = maxW
  let h = w / safeAspect
  if (h > maxH) {
    h = maxH
    w = h * safeAspect
  }
  const gap = 16
  const overlaps = (y: number) =>
    page.figures.some(
      (figure) =>
        margin < figure.x + figure.w + gap &&
        figure.x < margin + w + gap &&
        y < figure.y + figure.h + gap &&
        figure.y < y + h + gap,
    )
  const candidates = [margin, ...page.figures.map((figure) => figure.y + figure.h + gap)].sort((a, b) => a - b)
  const free = candidates.find((y) => y + h <= BOARD_H - margin && !overlaps(y))
  if (free !== undefined) return normaliseRect({ x: margin, y: free, w, h })
  const offset = page.figures.length * 28
  return normaliseRect({ x: margin + offset, y: margin + offset, w, h })
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** Distance from (px, py) to the segment a–b. */
export function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** The two barbs of an arrow pointing from (x1, y1) to (x2, y2). */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size: number): [number, number, number, number] {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const length = Math.min(Math.max(14, size * 3.5), Math.hypot(x2 - x1, y2 - y1) * 0.6 || 14)
  const spread = Math.PI / 7
  return [
    x2 - length * Math.cos(angle - spread),
    y2 - length * Math.sin(angle - spread),
    x2 - length * Math.cos(angle + spread),
    y2 - length * Math.sin(angle + spread),
  ]
}

/** An ellipse inscribed in the box between two corners, as a closed polygon. */
export function ellipsePolygon(x1: number, y1: number, x2: number, y2: number, segments = 48): number[] {
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2
  const rx = Math.abs(x2 - x1) / 2
  const ry = Math.abs(y2 - y1) / 2
  const out: number[] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    out.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a))
  }
  return out
}

/** The polylines that make up a shape's outline, as flat x, y lists. */
export function shapePolylines(tool: ShapeTool, pts: readonly number[], size: number): number[][] {
  const [x1, y1, x2, y2] = pts
  switch (tool) {
    case 'line':
      return [[x1, y1, x2, y2]]
    case 'arrow': {
      const [ax, ay, bx, by] = arrowHead(x1, y1, x2, y2, size)
      return [
        [x1, y1, x2, y2],
        [ax, ay, x2, y2, bx, by],
      ]
    }
    case 'rect':
      return [[x1, y1, x2, y1, x2, y2, x1, y2, x1, y1]]
    case 'ellipse':
      return [ellipsePolygon(x1, y1, x2, y2)]
  }
}

/**
 * Holding Shift while drawing a shape: lines and arrows snap to 45°, and
 * rectangles and ellipses become squares and circles.
 */
export function constrainShape(
  tool: ShapeTool,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): [number, number, number, number] {
  const dx = x2 - x1
  const dy = y2 - y1
  if (tool === 'line' || tool === 'arrow') {
    const step = Math.PI / 4
    const angle = Math.round(Math.atan2(dy, dx) / step) * step
    const length = Math.hypot(dx, dy)
    return [x1, y1, x1 + Math.cos(angle) * length, y1 + Math.sin(angle) * length]
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy))
  return [x1, y1, x1 + (dx < 0 ? -side : side), y1 + (dy < 0 ? -side : side)]
}

const boundsCache = new WeakMap<Stroke, [number, number, number, number]>()

function strokeBounds(stroke: Stroke): [number, number, number, number] {
  let bounds = boundsCache.get(stroke)
  if (!bounds) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const step = isFreehandTool(stroke.tool) ? 3 : 2
    for (let i = 0; i + 1 < stroke.pts.length; i += step) {
      minX = Math.min(minX, stroke.pts[i])
      maxX = Math.max(maxX, stroke.pts[i])
      minY = Math.min(minY, stroke.pts[i + 1])
      maxY = Math.max(maxY, stroke.pts[i + 1])
    }
    // An arrow's barbs reach a little past its corners.
    const pad = stroke.tool === 'arrow' ? Math.max(14, stroke.size * 3.5) : 0
    bounds = [minX - pad, minY - pad, maxX + pad, maxY + pad]
    boundsCache.set(stroke, bounds)
  }
  return bounds
}

/** Whether an eraser of radius r at (x, y) touches the stroke's ink. */
export function strokeHit(stroke: Stroke, x: number, y: number, r: number): boolean {
  const reach = r + stroke.size / 2
  const [minX, minY, maxX, maxY] = strokeBounds(stroke)
  if (x < minX - reach || x > maxX + reach || y < minY - reach || y > maxY + reach) return false

  if (isFreehandTool(stroke.tool)) {
    const pts = stroke.pts
    if (pts.length < 6) return Math.hypot(x - pts[0], y - pts[1]) <= reach
    for (let i = 3; i + 1 < pts.length; i += 3) {
      if (distanceToSegment(x, y, pts[i - 3], pts[i - 2], pts[i], pts[i + 1]) <= reach) return true
    }
    return false
  }

  // Shapes are outlines: rubbing inside a rectangle does not remove it.
  for (const line of shapePolylines(stroke.tool as ShapeTool, stroke.pts, stroke.size)) {
    for (let i = 2; i + 1 < line.length; i += 2) {
      if (distanceToSegment(x, y, line[i - 2], line[i - 1], line[i], line[i + 1]) <= reach) return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Input helpers
// ---------------------------------------------------------------------------

/**
 * Pressure for a mouse or finger, which have none: faster movement draws a
 * thinner line, as a pen would. This is perfect-freehand's own simulation,
 * measured per 60 Hz frame rather than per event, so a 1000 Hz gaming mouse
 * and a 60 Hz touchscreen draw the same line. It is worked out as the stroke
 * is drawn and stored as ordinary pressure, so the board, the saved sketch and
 * the page students see all draw it identically.
 */
export function simulatedPressure(previous: number, distance: number, elapsedMs: number, size: number): number {
  const frames = Math.max(elapsedMs, 1) / (1000 / 60)
  // perfect-freehand measures between smoothed points, which lag the pointer.
  const perFrame = (distance * 0.575) / frames
  const speed = Math.min(1, perFrame / Math.max(size, 1))
  const rate = Math.min(1, speed * 0.275 * frames)
  const next = previous + (Math.min(1, 1 - speed) - previous) * rate
  return Math.max(0.15, Math.min(1, next))
}

/** Pointer input may run off the board; keep it within a margin of the page. */
export function clampToBoard(x: number, y: number): [number, number] {
  const margin = 200
  return [Math.max(-margin, Math.min(BOARD_W + margin, x)), Math.max(-margin, Math.min(BOARD_H + margin, y))]
}

// ---------------------------------------------------------------------------
// Restoring pages from storage
// ---------------------------------------------------------------------------

const HEX = /^#[0-9a-fA-F]{6}$/
const INK_TOOLS: readonly string[] = ['pen', 'highlighter', ...SHAPE_TOOLS]

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function sanitizeStroke(value: unknown): Stroke | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.tool !== 'string' || !INK_TOOLS.includes(raw.tool)) return null
  if (typeof raw.color !== 'string' || !HEX.test(raw.color)) return null
  if (!finite(raw.size) || raw.size <= 0 || raw.size > 200) return null
  if (!Array.isArray(raw.pts) || !raw.pts.every(finite)) return null
  const tool = raw.tool as InkTool
  const pts = raw.pts as number[]
  if (isFreehandTool(tool)) {
    if (pts.length < 3 || pts.length % 3 !== 0) return null
  } else if (pts.length !== 4) {
    return null
  }
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    tool,
    color: raw.color.toLowerCase(),
    size: raw.size,
    pts,
  }
}

function sanitizeFigure(value: unknown): PinnedFigure | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (![raw.x, raw.y, raw.w, raw.h].every(finite) || (raw.w as number) <= 0 || (raw.h as number) <= 0) return null
  const id = typeof raw.id === 'string' && raw.id ? raw.id : newId()
  const rect = normaliseRect({ x: raw.x as number, y: raw.y as number, w: raw.w as number, h: raw.h as number })
  if (raw.card === 'plain' || raw.card === 'answer') return { id, card: raw.card, ...rect }
  const image = cloudinaryRefSchema.safeParse(raw.image)
  if (!image.success || image.data.source_url !== undefined) return null
  return { id, image: image.data, ...rect }
}

/**
 * Reads pages back from untrusted JSON (localStorage, a saved draft): keeps
 * what is well formed and drops the rest. Null when there is nothing usable.
 */
export function sanitizePages(value: unknown): BoardPage[] | null {
  if (!Array.isArray(value)) return null
  const seen = new Set<string>()
  const pages: BoardPage[] = []
  for (const item of value.slice(0, MAX_PAGES)) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    let id = typeof raw.id === 'string' && raw.id ? raw.id : newId()
    if (seen.has(id)) id = newId()
    seen.add(id)
    const strokes = Array.isArray(raw.strokes)
      ? raw.strokes.map(sanitizeStroke).filter((stroke): stroke is Stroke => stroke !== null)
      : []
    const figures = Array.isArray(raw.figures)
      ? raw.figures
          .map(sanitizeFigure)
          .filter((figure): figure is PinnedFigure => figure !== null)
          .slice(0, MAX_FIGURES)
      : []
    const bg = BACKGROUNDS.includes(raw.bg as BoardBackground) ? (raw.bg as BoardBackground) : 'plain'
    pages.push({ id, bg, strokes, figures })
  }
  return pages.length ? pages : null
}
