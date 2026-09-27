/**
 * Board pages as sketch blocks, and sketch blocks as drawable paths.
 *
 * A board page goes into a written explanation as a `sketch` block: its
 * strokes as whole numbers, simplified, small enough to live in the
 * explanation's JSON. Students see it redrawn as inline SVG from those
 * numbers, so it stays sharp at any zoom and costs no image upload.
 *
 * The path geometry here is shared: the canvas board draws the very same path
 * data (through Path2D) that the SVG does, so what the teacher drew is what
 * the student sees. No DOM is used, so this runs on the server too.
 */
import { getStroke, type StrokeOptions } from 'perfect-freehand'
import {
  SKETCH_MAX_BYTES,
  jsonByteLength,
  sketchBlockSchema,
  type CloudinaryRef,
  type SketchBlock,
} from '@/lib/blocks/schema'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { arrowHead, newId } from './model'
import { simplifyStroke } from './simplify'
import {
  BOARD_H,
  HIGHLIGHTER_ALPHA,
  isFreehandTool,
  type BoardPage,
  type InkTool,
  type PinnedFigure,
  type ShapeTool,
  type Stroke,
  pageWidth,
} from './types'

// ---------------------------------------------------------------------------
// Path geometry, shared by the canvas and the SVG
// ---------------------------------------------------------------------------

/** How one stroke is painted: a filled outline for ink, a stroked outline for shapes. */
export interface SketchPath {
  /** SVG path data: M, L, Q, C and Z only. */
  d: string
  /** Fill colour, or 'none' for a shape. */
  fill: string
  /** Outline colour, for shapes. */
  stroke?: string
  strokeWidth?: number
  opacity: number
  /** Highlighter ink multiplies with what is under it, so black ink shows through. */
  multiply?: boolean
}

/**
 * perfect-freehand's settings. Pressure is always given — a mouse's or a
 * finger's is simulated while drawing and stored with the points — so it is
 * never simulated again here. Streamlining (the lag that steadies a shaky
 * hand) is likewise applied once, as the points are captured: applied here
 * it would cut the corners of a simplified stroke, whose points are sparse.
 * So every renderer draws the same outline from the same points.
 */
export function freehandOptions(tool: 'pen' | 'highlighter', size: number, last: boolean): StrokeOptions {
  return {
    size,
    // The highlighter is a fixed-width marker; the pen swells with pressure.
    thinning: tool === 'highlighter' ? 0 : 0.5,
    smoothing: 0.5,
    streamline: 0,
    simulatePressure: false,
    last,
  }
}

/**
 * The outline of a pen or highlighter stroke, as a polygon.
 * @param pts x, y, pressure triplets, pressure 0–1.
 * @param last true once the stroke is finished; false while it is being drawn.
 */
export function freehandOutline(
  tool: 'pen' | 'highlighter',
  size: number,
  pts: readonly number[],
  last = true,
): number[][] {
  const points: number[][] = []
  for (let i = 0; i + 2 < pts.length; i += 3) points.push([pts[i], pts[i + 1], pts[i + 2]])
  if (!points.length) return []
  return getStroke(points, freehandOptions(tool, size, last))
}

/** A number for path data: at most one decimal, never exponent notation. */
function num(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

/**
 * A closed, smooth path through an outline polygon: quadratic curves from
 * the midpoint of each edge to the next, each bending at the vertex between.
 */
export function outlinePathData(outline: readonly number[][]): string {
  const count = outline.length
  if (count < 3) return ''
  const mid = (a: number[], b: number[]) => `${num((a[0] + b[0]) / 2)},${num((a[1] + b[1]) / 2)}`
  const parts = [`M${mid(outline[count - 1], outline[0])}`]
  for (let i = 0; i < count; i++) {
    const point = outline[i]
    parts.push(`Q${num(point[0])},${num(point[1])} ${mid(point, outline[(i + 1) % count])}`)
  }
  parts.push('Z')
  return parts.join('')
}

/** Bézier handle length for a quarter circle. */
const KAPPA = 0.5522847498

/** Path data for a shape between two corners. Arcs are avoided, so it is M, L, C and Z only. */
export function shapePathData(tool: ShapeTool, pts: readonly number[], size: number): string {
  const [x1, y1, x2, y2] = pts
  if (tool === 'ellipse') {
    const cx = (x1 + x2) / 2
    const cy = (y1 + y2) / 2
    const rx = Math.abs(x2 - x1) / 2
    const ry = Math.abs(y2 - y1) / 2
    const kx = rx * KAPPA
    const ky = ry * KAPPA
    return [
      `M${num(cx + rx)},${num(cy)}`,
      `C${num(cx + rx)},${num(cy + ky)} ${num(cx + kx)},${num(cy + ry)} ${num(cx)},${num(cy + ry)}`,
      `C${num(cx - kx)},${num(cy + ry)} ${num(cx - rx)},${num(cy + ky)} ${num(cx - rx)},${num(cy)}`,
      `C${num(cx - rx)},${num(cy - ky)} ${num(cx - kx)},${num(cy - ry)} ${num(cx)},${num(cy - ry)}`,
      `C${num(cx + kx)},${num(cy - ry)} ${num(cx + rx)},${num(cy - ky)} ${num(cx + rx)},${num(cy)}`,
      'Z',
    ].join('')
  }
  if (tool === 'rect') {
    return `M${num(x1)},${num(y1)}L${num(x2)},${num(y1)}L${num(x2)},${num(y2)}L${num(x1)},${num(y2)}Z`
  }
  if (tool === 'arrow') {
    const [ax, ay, bx, by] = arrowHead(x1, y1, x2, y2, size)
    return `M${num(x1)},${num(y1)}L${num(x2)},${num(y2)}M${num(ax)},${num(ay)}L${num(x2)},${num(y2)}L${num(bx)},${num(by)}`
  }
  return `M${num(x1)},${num(y1)}L${num(x2)},${num(y2)}`
}

/**
 * How to paint one stroke.
 * @param pts for the pen and highlighter, pressure is 0–1.
 * @param last false while the stroke is still being drawn.
 */
export function strokePaint(
  tool: InkTool,
  color: string,
  size: number,
  pts: readonly number[],
  last = true,
): SketchPath {
  if (isFreehandTool(tool)) {
    const d = outlinePathData(freehandOutline(tool, size, pts, last))
    return tool === 'highlighter'
      ? { d, fill: color, opacity: HIGHLIGHTER_ALPHA, multiply: true }
      : { d, fill: color, opacity: 1 }
  }
  return { d: shapePathData(tool, pts, size), fill: 'none', stroke: color, strokeWidth: size, opacity: 1 }
}

/**
 * The URL a pinned figure loads from, on the board and in the sketch alike.
 * It is exactly the URL the question itself shows the image at (see
 * ImageBlockView), so pinning asks Cloudinary for no new resized copy — each
 * one counts against the plan — and the browser usually has it cached
 * already. A figure cut from a sheet loads the whole sheet, which its region
 * then windows.
 */
export function figureImageUrl(ref: CloudinaryRef): string {
  return cloudinaryUrl(ref, { width: 1024 })
}

/** Paths for every stroke of a sketch block, in drawing order. */
export function sketchToSvgPaths(block: Pick<SketchBlock, 'strokes'>): SketchPath[] {
  return block.strokes.map((stroke) =>
    strokePaint(
      stroke.tool,
      stroke.color,
      stroke.size,
      isFreehandTool(stroke.tool) ? stroke.pts.map((value, i) => (i % 3 === 2 ? value / 100 : value)) : stroke.pts,
    ),
  )
}

// ---------------------------------------------------------------------------
// Board page → sketch block
// ---------------------------------------------------------------------------

/** Simplification for a stored sketch: under a pixel at the board's full size. */
export const SKETCH_EPSILON = 0.75
/** Pressure (0–100) a dropped point may differ by. */
const SKETCH_PRESSURE_EPSILON = 8
const MAX_STROKES = 1_500
const MAX_POINTS = 30_000
/** Sketch coordinates must stay inside this range. */
const COORD_LIMIT = 10_000

export class SketchTooLargeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SketchTooLargeError'
  }
}

function coord(value: number): number {
  return Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, Math.round(value)))
}

function sketchStroke(stroke: Stroke, epsilon: number): SketchBlock['strokes'][number] {
  const color = stroke.color.toLowerCase()
  const size = Math.max(0.5, Math.min(200, Math.round(stroke.size * 10) / 10))
  if (!isFreehandTool(stroke.tool)) {
    return { tool: stroke.tool, color, size, pts: stroke.pts.slice(0, 4).map(coord) }
  }

  // Round first, then simplify: simplifying whole numbers again changes
  // nothing, so a sketch reopened on the board exports exactly as before.
  const rounded: number[] = []
  for (let i = 0; i + 2 < stroke.pts.length; i += 3) {
    rounded.push(
      coord(stroke.pts[i]),
      coord(stroke.pts[i + 1]),
      Math.max(0, Math.min(100, Math.round(stroke.pts[i + 2] * 100))),
    )
  }
  let pts = simplifyStroke(rounded, epsilon, SKETCH_PRESSURE_EPSILON)
  // One very long stroke: coarsen it alone until it fits a stroke's limit.
  for (let coarser = epsilon * 2; pts.length > MAX_POINTS; coarser *= 2) {
    pts = simplifyStroke(rounded, coarser, SKETCH_PRESSURE_EPSILON * 2)
  }
  return { tool: stroke.tool, color, size, pts }
}

function buildSketch(page: BoardPage, alt: string, caption: string | undefined, epsilon: number): SketchBlock {
  const block: SketchBlock = {
    type: 'sketch',
    w: pageWidth(page),
    h: BOARD_H,
    strokes: page.strokes.map((stroke) => sketchStroke(stroke, epsilon)),
    alt,
  }
  if (page.bg !== 'plain') block.bg = page.bg
  // The question card is a picture made in the browser, never uploaded: a
  // saved page keeps the ink and the site's own figures, not the card.
  const figures = page.figures.filter((figure): figure is PinnedFigure & { image: NonNullable<PinnedFigure['image']> } =>
    Boolean(figure.image),
  )
  if (figures.length) {
    block.figures = figures.map(({ image, x, y, w, h }) => ({
      image,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      w: Math.round(w * 10) / 10,
      h: Math.round(h * 10) / 10,
    }))
  }
  if (caption) block.caption = caption
  return block
}

/**
 * A board page as a sketch block for a written explanation. Throws a
 * SketchTooLargeError, worded for the teacher, when the page will not fit.
 */
export function toSketch(page: BoardPage, alt = 'Board drawing', caption?: string): SketchBlock {
  if (page.strokes.length > MAX_STROKES) {
    throw new SketchTooLargeError(
      `This page has ${page.strokes.length.toLocaleString('en-IN')} strokes; a board page in an explanation can hold ${MAX_STROKES.toLocaleString('en-IN')}. Split the drawing across two pages.`,
    )
  }

  let block: SketchBlock | null = null
  // A slightly coarser pass before giving up: still under two pixels on a full-size board.
  for (const epsilon of [SKETCH_EPSILON, SKETCH_EPSILON * 2]) {
    const candidate = buildSketch(page, alt.trim().slice(0, 2_000), caption?.trim().slice(0, 2_000) || undefined, epsilon)
    if (jsonByteLength(candidate) <= SKETCH_MAX_BYTES) {
      block = candidate
      break
    }
  }
  if (!block) {
    throw new SketchTooLargeError(
      `This page is too detailed to add to an explanation (the limit is ${SKETCH_MAX_BYTES / 1000} kB). Split the drawing across two pages, or erase some of it.`,
    )
  }

  const checked = sketchBlockSchema.safeParse(block)
  if (!checked.success) {
    throw new Error(checked.error.issues[0]?.message ?? 'This page could not be turned into a drawing.')
  }
  return block
}

/** A sketch block back on the board, to change and insert again. */
export function sketchToPage(block: SketchBlock): BoardPage {
  return {
    id: newId(),
    bg: block.bg ?? 'plain',
    strokes: block.strokes.map((stroke) => ({
      id: newId(),
      tool: stroke.tool,
      color: stroke.color.toLowerCase(),
      size: stroke.size,
      pts: isFreehandTool(stroke.tool) ? stroke.pts.map((value, i) => (i % 3 === 2 ? value / 100 : value)) : [...stroke.pts],
    })),
    figures: (block.figures ?? []).map((figure) => ({ id: newId(), ...figure })),
  }
}
