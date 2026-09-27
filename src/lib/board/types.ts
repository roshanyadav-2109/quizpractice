/**
 * The whiteboard's vocabulary, shared by the reducer, the canvas renderer,
 * the pointer input and the sketch exporter.
 *
 * Everything is measured in board units: the board is always 1280 × 720,
 * whatever size it is drawn at, so a stroke means the same thing on a phone,
 * on a 4K monitor and in the 720p recording. Stored sketches use the same
 * units, which is why a board page can go into an explanation unchanged.
 */
import type { CloudinaryRef, SketchStroke } from '@/lib/blocks/schema'

export const BOARD_W = 1280
export const BOARD_H = 720

/** Tools that leave marks on the page: exactly the sketch block's stroke tools. */
export type InkTool = SketchStroke['tool']
export type ShapeTool = Extract<InkTool, 'line' | 'arrow' | 'rect' | 'ellipse'>
/** Everything the pointer can be: ink, plus the eraser and the laser, which leave nothing behind. */
export type Tool = InkTool | 'eraser' | 'laser'
export type BoardBackground = 'plain' | 'grid' | 'dots'

export const SHAPE_TOOLS: readonly ShapeTool[] = ['line', 'arrow', 'rect', 'ellipse']
export const BACKGROUNDS: readonly BoardBackground[] = ['plain', 'grid', 'dots']

export function isShapeTool(tool: Tool): tool is ShapeTool {
  return (SHAPE_TOOLS as readonly string[]).includes(tool)
}

export function isFreehandTool(tool: Tool): tool is 'pen' | 'highlighter' {
  return tool === 'pen' || tool === 'highlighter'
}

/**
 * One finished mark. Strokes are never edited in place: the reducer replaces
 * arrays, so a stroke object can key caches for as long as it lives.
 *
 * pts for the pen and highlighter: x, y, pressure triplets, pressure 0–1.
 * For shapes: the two corners, x1, y1, x2, y2.
 */
export interface Stroke {
  id: string
  tool: InkTool
  /** #rrggbb */
  color: string
  /** Width in board units. */
  size: number
  pts: number[]
}

/** Which picture of the question card: as students see it, or with the answer marked. */
export type CardKind = 'plain' | 'answer'

/** A picture of the question card, made in the browser; never uploaded or saved. */
export interface CardPicture {
  image: CanvasImageSource
  width: number
  height: number
}

/**
 * Something placed on the page and drawn beneath the ink, so the teacher can
 * write over it: one of the question's own figures, or the whole question
 * card — text, options, figures and, if chosen, the answer.
 */
export interface PinnedFigure {
  id: string
  /** A question figure already on the site. Absent for the question card. */
  image?: CloudinaryRef
  /** The question card. */
  card?: CardKind
  x: number
  y: number
  w: number
  h: number
}

export interface BoardPage {
  id: string
  bg: BoardBackground
  strokes: Stroke[]
  figures: PinnedFigure[]
}

export interface BoardRect {
  x: number
  y: number
  w: number
  h: number
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

/** Pen and shape colours: dark enough to read on white paper and in a compressed video. */
export const PEN_COLORS = ['#111111', '#1d4ed8', '#dc2626', '#15803d', '#ea580c', '#7c3aed'] as const
/** Highlighter colours, laid down at 35% and multiplied, so ink under them stays black. */
export const HIGHLIGHTER_COLORS = ['#facc15', '#22c55e', '#ec4899', '#38bdf8', '#fb923c', '#a855f7'] as const
export const COLOR_NAMES = ['Black', 'Blue', 'Red', 'Green', 'Orange', 'Purple'] as const
export const HIGHLIGHTER_COLOR_NAMES = ['Yellow', 'Green', 'Pink', 'Blue', 'Orange', 'Purple'] as const

/** Three widths per tool, in board units. The middle one is the default. */
export const PEN_SIZES = [3, 5, 9] as const
export const HIGHLIGHTER_SIZES = [14, 24, 38] as const
/** The eraser's radius. */
export const ERASER_SIZES = [8, 18, 40] as const
export const SIZE_NAMES = ['Fine', 'Medium', 'Bold'] as const

/** Grid and dot spacing, in board units: 32 × 18 cells. */
export const GRID_STEP = 40
/** Ruling colours: visible on the board and in the video, quiet beside the ink. */
export const GRID_COLOR = '#e2e8f0'
export const DOT_COLOR = '#cbd5e1'
export const DOT_RADIUS = 1.8

/** The highlighter's opacity. */
export const HIGHLIGHTER_ALPHA = 0.35
/** The laser's trail fades out over this long, and is never stored. */
export const LASER_TRAIL_MS = 600
export const LASER_COLOR = '#ff2d2d'

/** A board holds at most this many pages; a sketch at most this many figures. */
export const MAX_PAGES = 50
export const MAX_FIGURES = 4
/** Undo steps kept per page. */
export const MAX_HISTORY = 200
