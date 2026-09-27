/**
 * Drawing the board on a canvas. Browser only: it uses Path2D, canvases and
 * images, and is imported by the whiteboard's client components alone.
 *
 * Finished ink is drawn once into a layer canvas per surface and reused, so a
 * frame costs one image copy plus the stroke still being drawn and the laser,
 * whatever is on the page. The same code draws the on-screen board, the
 * recorder's 1280 × 720 frame and the page thumbnails, each from vectors at
 * its own resolution — the recording is never an upscaled screen.
 */
import type { CloudinaryRef } from '@/lib/blocks/schema'
import { figureImageUrl, strokePaint, type SketchPath } from './sketch'
import {
  BOARD_H,
  BOARD_W,
  DOT_COLOR,
  DOT_RADIUS,
  GRID_COLOR,
  GRID_STEP,
  LASER_COLOR,
  LASER_TRAIL_MS,
  type BoardBackground,
  type BoardPage,
  type BoardRect,
  type InkTool,
  type PinnedFigure,
  type Stroke,
} from './types'

type Ctx = CanvasRenderingContext2D

// ---------------------------------------------------------------------------
// Strokes
// ---------------------------------------------------------------------------

/** Paths for finished strokes. Strokes are immutable, so the object is the key. */
const strokeCache = new WeakMap<Stroke, { paint: SketchPath; path: Path2D }>()

export function paintPath(ctx: Ctx, paint: SketchPath, path: Path2D): void {
  ctx.save()
  ctx.globalAlpha = paint.opacity
  if (paint.multiply) ctx.globalCompositeOperation = 'multiply'
  if (paint.fill !== 'none') {
    ctx.fillStyle = paint.fill
    ctx.fill(path)
  }
  if (paint.stroke) {
    ctx.strokeStyle = paint.stroke
    ctx.lineWidth = paint.strokeWidth ?? 1
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke(path)
  }
  ctx.restore()
}

export function drawStroke(ctx: Ctx, stroke: Stroke): void {
  let cached = strokeCache.get(stroke)
  if (!cached) {
    const paint = strokePaint(stroke.tool, stroke.color, stroke.size, stroke.pts)
    cached = { paint, path: new Path2D(paint.d) }
    strokeCache.set(stroke, cached)
  }
  paintPath(ctx, cached.paint, cached.path)
}

/** The stroke under the pen, or the shape being dragged out. */
export interface LiveStroke {
  tool: InkTool
  color: string
  size: number
  pts: number[]
}

export function drawLiveStroke(ctx: Ctx, live: LiveStroke): void {
  const paint = strokePaint(live.tool, live.color, live.size, live.pts, false)
  if (paint.d) paintPath(ctx, paint, new Path2D(paint.d))
}

// ---------------------------------------------------------------------------
// Paper
// ---------------------------------------------------------------------------

export function drawBackground(ctx: Ctx, bg: BoardBackground): void {
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, BOARD_W, BOARD_H)
  if (bg === 'grid') {
    ctx.beginPath()
    for (let x = GRID_STEP; x < BOARD_W; x += GRID_STEP) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, BOARD_H)
    }
    for (let y = GRID_STEP; y < BOARD_H; y += GRID_STEP) {
      ctx.moveTo(0, y)
      ctx.lineTo(BOARD_W, y)
    }
    ctx.strokeStyle = GRID_COLOR
    ctx.lineWidth = 1
    ctx.stroke()
  } else if (bg === 'dots') {
    ctx.beginPath()
    for (let x = GRID_STEP; x < BOARD_W; x += GRID_STEP) {
      for (let y = GRID_STEP; y < BOARD_H; y += GRID_STEP) {
        ctx.moveTo(x + DOT_RADIUS, y)
        ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2)
      }
    }
    ctx.fillStyle = DOT_COLOR
    ctx.fill()
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Pinned figures
// ---------------------------------------------------------------------------

type ImageEntry = { img: HTMLImageElement; state: 'loading' | 'ready' | 'failed'; promise: Promise<HTMLImageElement> }

/**
 * Figure images, loaded once per URL. They are requested with CORS
 * (Cloudinary answers with Access-Control-Allow-Origin: *), which keeps
 * every canvas they are drawn on exportable and recordable; an image served
 * without CORS fails to load rather than tainting the recording.
 */
export class FigureImages {
  /** Goes up whenever an image finishes loading or fails. */
  version = 0
  private entries = new Map<string, ImageEntry>()
  private listeners = new Set<() => void>()

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getVersion = (): number => this.version

  /** The image if it has loaded; otherwise starts loading it and returns null. */
  get(ref: CloudinaryRef): HTMLImageElement | null {
    const url = figureImageUrl(ref)
    if (!url) return null
    const entry = this.ensure(url)
    return entry.state === 'ready' ? entry.img : null
  }

  /** Resolves once the image is ready to draw; rejects when it cannot be loaded. */
  load(ref: CloudinaryRef): Promise<HTMLImageElement> {
    const url = figureImageUrl(ref)
    if (!url) return Promise.reject(new Error('Images are not configured on this site.'))
    const existing = this.entries.get(url)
    // A failed image may have been a dropped connection: try again.
    if (existing?.state === 'failed') this.entries.delete(url)
    return this.ensure(url).promise
  }

  private ensure(url: string): ImageEntry {
    let entry = this.entries.get(url)
    if (entry) return entry
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => {
        created.state = 'ready'
        this.bump()
        resolve(img)
      }
      img.onerror = () => {
        created.state = 'failed'
        this.bump()
        reject(new Error('That figure could not be loaded. Check your connection and try again.'))
      }
    })
    // Nobody may be waiting on it; an unhandled rejection is not an error here.
    promise.catch(() => {})
    const created: ImageEntry = { img, state: 'loading', promise }
    entry = created
    this.entries.set(url, entry)
    img.src = url
    return entry
  }

  private bump() {
    this.version += 1
    for (const listener of this.listeners) listener()
  }
}

/** The part of a loaded image a figure shows, in the image's own pixels. */
function sourceRect(ref: CloudinaryRef, img: HTMLImageElement): BoardRect {
  const region = ref.region
  if (!region) return { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }
  // The sheet may have been delivered smaller than it was cut from.
  const sx = img.naturalWidth / region.sheet_width
  const sy = img.naturalHeight / region.sheet_height
  return { x: region.x * sx, y: region.y * sy, w: region.width * sx, h: region.height * sy }
}

/** A figure's width over its height, as it will be shown. */
export function figureAspect(ref: CloudinaryRef, img?: HTMLImageElement | null): number {
  if (ref.region) return ref.region.width / ref.region.height
  if (ref.width && ref.height) return ref.width / ref.height
  if (img?.naturalWidth && img.naturalHeight) return img.naturalWidth / img.naturalHeight
  return 4 / 3
}

export function drawFigure(ctx: Ctx, figure: PinnedFigure, images: FigureImages): void {
  const img = images.get(figure.image)
  if (!img || !img.naturalWidth) {
    // Still loading, or unavailable: hold its place so ink around it makes sense.
    ctx.save()
    ctx.fillStyle = '#f5f5f4'
    ctx.fillRect(figure.x, figure.y, figure.w, figure.h)
    ctx.strokeStyle = '#d6d3d1'
    ctx.setLineDash([8, 6])
    ctx.lineWidth = 2
    ctx.strokeRect(figure.x, figure.y, figure.w, figure.h)
    ctx.restore()
    return
  }
  const source = sourceRect(figure.image, img)
  ctx.drawImage(img, source.x, source.y, source.w, source.h, figure.x, figure.y, figure.w, figure.h)
}

// ---------------------------------------------------------------------------
// Whole pages
// ---------------------------------------------------------------------------

/** Paper, figures, then ink, in board units: the caller sets the transform. */
export function drawPage(ctx: Ctx, page: BoardPage, images: FigureImages): void {
  drawBackground(ctx, page.bg)
  for (const figure of page.figures) drawFigure(ctx, figure, images)
  for (const stroke of page.strokes) drawStroke(ctx, stroke)
}

/**
 * A page rendered once at a given pixel size and kept. A new stroke on the
 * same page is drawn onto what is already there; anything else (an undo, an
 * erase, a new size, a figure arriving) redraws the page from its vectors.
 */
export class PageLayer {
  private canvas: HTMLCanvasElement | null = null
  private page: BoardPage | null = null
  private imagesVersion = -1

  render(page: BoardPage, width: number, height: number, images: FigureImages): HTMLCanvasElement | null {
    if (width < 1 || height < 1) return null
    if (!this.canvas) this.canvas = document.createElement('canvas')
    const canvas = this.canvas
    const resized = canvas.width !== width || canvas.height !== height
    if (resized) {
      canvas.width = width
      canvas.height = height
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const previous = this.page
    if (!resized && previous === page && this.imagesVersion === images.version) return canvas

    ctx.setTransform(width / BOARD_W, 0, 0, height / BOARD_H, 0, 0)
    if (!resized && previous && this.imagesVersion === images.version && appendsTo(previous, page)) {
      for (let i = previous.strokes.length; i < page.strokes.length; i++) drawStroke(ctx, page.strokes[i])
    } else {
      ctx.clearRect(0, 0, BOARD_W, BOARD_H)
      drawPage(ctx, page, images)
    }
    this.page = page
    this.imagesVersion = images.version
    return canvas
  }

  /** Frees the pixels. */
  release(): void {
    if (this.canvas) {
      this.canvas.width = 0
      this.canvas.height = 0
    }
    this.canvas = null
    this.page = null
  }
}

/** Whether `next` is `previous` with strokes added at the end and nothing else changed. */
function appendsTo(previous: BoardPage, next: BoardPage): boolean {
  if (previous.id !== next.id || previous.bg !== next.bg || previous.figures !== next.figures) return false
  if (next.strokes.length < previous.strokes.length) return false
  for (let i = 0; i < previous.strokes.length; i++) {
    if (previous.strokes[i] !== next.strokes[i]) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Pointer feedback: laser and eraser
// ---------------------------------------------------------------------------

export interface LaserPoint {
  x: number
  y: number
  /** performance.now() when the point was made. */
  t: number
}

/** Drops trail points older than the fade. Returns whether any remain. */
export function pruneLaser(trail: LaserPoint[], now: number): boolean {
  let drop = 0
  while (drop < trail.length && now - trail[drop].t > LASER_TRAIL_MS) drop++
  if (drop) trail.splice(0, drop)
  return trail.length > 0
}

/** A red fading trail and a bright dot where the pointer is. */
export function drawLaser(ctx: Ctx, trail: readonly LaserPoint[], now: number, head: { x: number; y: number } | null): void {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = LASER_COLOR
  for (let i = 1; i < trail.length; i++) {
    const fade = 1 - (now - trail[i].t) / LASER_TRAIL_MS
    if (fade <= 0) continue
    ctx.globalAlpha = 0.85 * fade
    ctx.lineWidth = 2 + 6 * fade
    ctx.beginPath()
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y)
    ctx.lineTo(trail[i].x, trail[i].y)
    ctx.stroke()
  }
  if (head) {
    ctx.fillStyle = LASER_COLOR
    ctx.globalAlpha = 0.22
    ctx.beginPath()
    ctx.arc(head.x, head.y, 14, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(head.x, head.y, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    ctx.arc(head.x - 1.5, head.y - 1.5, 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** The eraser's reach, as a ring. */
export function drawEraserRing(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = 'rgba(87, 83, 78, 0.9)'
  ctx.stroke()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// The painter: one board, drawn on screen and on demand
// ---------------------------------------------------------------------------

/** Sizes paint() keeps a finished-ink layer for at once. */
const MAX_OUTPUT_LAYERS = 3
/** Largest layer paint() draws, in pixels a side: beyond it the ink is scaled up. */
const MAX_OUTPUT = 4096

/** Where the pointer is and what it is doing, for the frame being drawn. */
export interface PointerFeedback {
  live: LiveStroke | null
  laser: LaserPoint[]
  laserHead: { x: number; y: number } | null
  eraser: { x: number; y: number; r: number; pressed: boolean } | null
}

/**
 * Owns the on-screen canvas and keeps it current. Anything that changes the
 * picture calls invalidate(); the next animation frame redraws the screen and
 * then tells every onChange listener, so a recorder can redraw exactly when
 * the board does. paint() draws the same picture into anyone else's canvas.
 */
export class BoardPainter {
  readonly images = new FigureImages()
  readonly feedback: PointerFeedback = { live: null, laser: [], laserHead: null, eraser: null }

  private screen: { canvas: HTMLCanvasElement; ctx: Ctx } | null = null
  private screenLayer = new PageLayer()
  /**
   * One layer per size paint() is asked for, most recent last: a recorder
   * and a small preview each keep their own, rather than taking turns to
   * redraw a single one from scratch every frame.
   */
  private outputLayers = new Map<string, PageLayer>()
  private listeners = new Set<() => void>()
  private frame = 0

  constructor(private readonly currentPage: () => BoardPage) {
    // A figure finishing loading changes the picture.
    this.images.subscribe(() => this.invalidate())
  }

  attach(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d', { alpha: false })
    this.screen = ctx ? { canvas, ctx } : null
    this.invalidate()
  }

  detach(): void {
    this.screen = null
    this.screenLayer.release()
    for (const layer of this.outputLayers.values()) layer.release()
    this.outputLayers.clear()
  }

  /** Sets the on-screen canvas's backing size, in device pixels. */
  resize(width: number, height: number): void {
    if (!this.screen) return
    const { canvas } = this.screen
    if (canvas.width === width && canvas.height === height) return
    canvas.width = width
    canvas.height = height
    this.invalidate()
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  invalidate = (): void => {
    if (this.frame || typeof requestAnimationFrame === 'undefined') return
    this.frame = requestAnimationFrame(this.tick)
  }

  /**
   * Draws the current page, the stroke in progress and the laser into any
   * canvas, filling dest (in that canvas's current units).
   */
  paint(ctx: Ctx, dest: BoardRect): void {
    // The layer matches the pixels dest covers, so the ink is drawn at the output's own resolution.
    const transform = ctx.getTransform()
    const scaleX = Math.hypot(transform.a, transform.b) || 1
    const scaleY = Math.hypot(transform.c, transform.d) || 1
    const width = Math.max(1, Math.min(MAX_OUTPUT, Math.round(dest.w * scaleX)))
    const height = Math.max(1, Math.min(MAX_OUTPUT, Math.round(dest.h * scaleY)))
    const layer = this.outputLayer(width, height).render(this.currentPage(), width, height, this.images)

    ctx.save()
    ctx.beginPath()
    ctx.rect(dest.x, dest.y, dest.w, dest.h)
    ctx.clip()
    if (layer) ctx.drawImage(layer, dest.x, dest.y, dest.w, dest.h)
    ctx.translate(dest.x, dest.y)
    ctx.scale(dest.w / BOARD_W, dest.h / BOARD_H)
    // The eraser's ring shows on the recording only while it is rubbing out.
    this.drawFeedback(ctx, performance.now(), false)
    ctx.restore()
  }

  private outputLayer(width: number, height: number): PageLayer {
    const key = `${width}x${height}`
    let layer = this.outputLayers.get(key)
    if (layer) {
      this.outputLayers.delete(key)
    } else {
      layer = new PageLayer()
      // A window being resized asks for many sizes; keep only the latest few.
      while (this.outputLayers.size >= MAX_OUTPUT_LAYERS) {
        const oldest = this.outputLayers.keys().next().value as string
        this.outputLayers.get(oldest)?.release()
        this.outputLayers.delete(oldest)
      }
    }
    this.outputLayers.set(key, layer)
    return layer
  }

  private drawFeedback(ctx: Ctx, now: number, onScreen: boolean): void {
    const { live, laser, laserHead, eraser } = this.feedback
    if (live) drawLiveStroke(ctx, live)
    if (eraser && (onScreen || eraser.pressed)) drawEraserRing(ctx, eraser.x, eraser.y, eraser.r)
    if (laser.length || laserHead) drawLaser(ctx, laser, now, laserHead)
  }

  private tick = (now: number): void => {
    this.frame = 0
    const fading = pruneLaser(this.feedback.laser, now)

    const screen = this.screen
    if (screen && screen.canvas.width > 0 && screen.canvas.height > 0) {
      const { canvas, ctx } = screen
      const layer = this.screenLayer.render(this.currentPage(), canvas.width, canvas.height, this.images)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      if (layer) ctx.drawImage(layer, 0, 0)
      ctx.setTransform(canvas.width / BOARD_W, 0, 0, canvas.height / BOARD_H, 0, 0)
      this.drawFeedback(ctx, now, true)
    }

    for (const listener of this.listeners) listener()
    // Keep going while the laser trail is still fading out.
    if (fading) this.invalidate()
  }
}
