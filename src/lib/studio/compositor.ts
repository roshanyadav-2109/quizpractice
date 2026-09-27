import type { WhiteboardHandle } from '@/components/board/Whiteboard'

/**
 * The picture that is recorded: one 1280 × 720 canvas, drawn in layers.
 *
 *   1. The board, over the whole frame, from its vectors at this size
 *      (WhiteboardHandle.paint) — never an upscaled copy of the screen.
 *   2. The question card, top left: the question, its options and — when
 *      the teacher chooses — the answer, as pictures made by
 *      question-raster.ts. It folds away to a small "Question 7" tab, scrolls
 *      when the question is long and zooms when it needs to be read.
 *   3. The webcam, if on, in a round bubble bottom right.
 *
 * Only this canvas is recorded: never the rest of the screen, the tabs, or
 * the notifications. The frame is redrawn whenever the board changes, on
 * every webcam frame while the camera is on, and twice a second otherwise, so
 * the encoder always has frames even when the teacher is only talking.
 *
 * Browser only.
 */

export const FRAME_W = 1280
export const FRAME_H = 720

/** Space between the card or bubble and the frame's edge. */
const MARGIN = 20
/** The card's width on the frame at zoom 1. */
const CARD_WIDTH = 500
export const ZOOM_MIN = 0.6
export const ZOOM_MAX = 1.8
/** The webcam bubble's diameter. */
const BUBBLE = 168
/** How often the frame is redrawn when nothing is happening. */
const IDLE_REPAINT_MS = 500

/** A picture of the question card, `width` × `height` pixels. */
export interface CardImage {
  image: CanvasImageSource
  width: number
  height: number
}

export interface CardImages {
  plain: CardImage
  answer: CardImage
}

export interface CardState {
  open: boolean
  showAnswer: boolean
  zoom: number
}

export class Compositor {
  private readonly ctx: CanvasRenderingContext2D
  private images: CardImages | null = null
  private open = true
  private showAnswer = false
  private zoom = 1
  /** How far the card is scrolled, in the card picture's own pixels. */
  private scroll = 0
  private webcam: HTMLVideoElement | null = null
  private webcamFrame = 0
  private webcamTimer: ReturnType<typeof setInterval> | undefined
  private idleTimer: ReturnType<typeof setInterval> | undefined
  private frame = 0
  private lastDraw = 0
  private board: WhiteboardHandle | null = null
  private unsubscribeBoard: (() => void) | null = null
  private disposed = false

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getBoard: () => WhiteboardHandle | null,
    private readonly options: { label: string; fontFamily: string },
  ) {
    canvas.width = FRAME_W
    canvas.height = FRAME_H
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('This browser cannot draw the recording.')
    this.ctx = ctx
  }

  start(): void {
    this.follow()
    this.draw()
    this.idleTimer = setInterval(() => {
      this.follow()
      if (performance.now() - this.lastDraw >= IDLE_REPAINT_MS - 50) this.draw()
    }, IDLE_REPAINT_MS)
  }

  dispose(): void {
    this.disposed = true
    clearInterval(this.idleTimer)
    this.stopWebcamLoop()
    this.unsubscribeBoard?.()
    this.unsubscribeBoard = null
    if (this.frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  /** Redraws on every board change; picks up a board mounted (or remounted) after start. */
  private follow(): void {
    const board = this.getBoard()
    if (board === this.board) return
    this.unsubscribeBoard?.()
    this.board = board
    // The board calls back from its own animation frame, once per change: draw at once.
    this.unsubscribeBoard = board ? board.onChange(() => this.draw()) : null
  }

  get card(): CardState {
    return { open: this.open, showAnswer: this.showAnswer, zoom: this.zoom }
  }

  setCard(images: CardImages | null): void {
    this.images = images
    this.requestFrame()
  }

  setCardOpen(open: boolean): void {
    this.open = open
    this.requestFrame()
  }

  setShowAnswer(show: boolean): void {
    this.showAnswer = show
    this.requestFrame()
  }

  /** Scrolls the card by `framePx` pixels of the recording (down is positive). */
  scrollCard(framePx: number): void {
    const layout = this.cardLayout()
    if (!layout) return
    this.scroll = clamp(this.scroll + framePx / layout.scale, 0, layout.maxScroll)
    this.requestFrame()
  }

  scrollCardToTop(): void {
    this.scroll = 0
    this.requestFrame()
  }

  /** Multiplies the card's zoom, keeping it within bounds. Returns the new zoom. */
  zoomCard(factor: number): number {
    this.zoom = clamp(Math.round(this.zoom * factor * 100) / 100, ZOOM_MIN, ZOOM_MAX)
    this.requestFrame()
    return this.zoom
  }

  setWebcam(video: HTMLVideoElement | null): void {
    this.stopWebcamLoop()
    this.webcam = video
    if (video) this.startWebcamLoop(video)
    this.requestFrame()
  }

  private startWebcamLoop(video: HTMLVideoElement): void {
    type FrameCallbackVideo = HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number
    }
    const withCallback = video as FrameCallbackVideo
    if (typeof withCallback.requestVideoFrameCallback === 'function') {
      const loop = () => {
        if (this.webcam !== video || this.disposed) return
        this.requestFrame()
        this.webcamFrame = withCallback.requestVideoFrameCallback!(loop)
      }
      this.webcamFrame = withCallback.requestVideoFrameCallback(loop)
    } else {
      this.webcamTimer = setInterval(() => this.requestFrame(), 1000 / 30)
    }
  }

  private stopWebcamLoop(): void {
    const video = this.webcam as (HTMLVideoElement & { cancelVideoFrameCallback?: (handle: number) => void }) | null
    if (video && this.webcamFrame && typeof video.cancelVideoFrameCallback === 'function') {
      video.cancelVideoFrameCallback(this.webcamFrame)
    }
    this.webcamFrame = 0
    clearInterval(this.webcamTimer)
    this.webcamTimer = undefined
  }

  /** Draws on the next animation frame, or soon when the page is hidden and frames are not coming. */
  requestFrame = (): void => {
    if (this.frame || this.disposed) return
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
    if (!hidden && typeof requestAnimationFrame === 'function') {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0
        this.draw()
      })
    } else {
      this.frame = -1
      setTimeout(() => {
        this.frame = 0
        this.draw()
      }, 16)
    }
  }

  draw = (): void => {
    if (this.disposed) return
    this.lastDraw = performance.now()
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, FRAME_W, FRAME_H)
    const board = this.board ?? this.getBoard()
    if (board) {
      try {
        board.paint(ctx, { x: 0, y: 0, w: FRAME_W, h: FRAME_H })
      } catch {
        // A board mid-remount: the paper alone this frame.
      }
    }
    this.drawCard(ctx)
    this.drawBubble(ctx)
  }

  private currentImage(): CardImage | null {
    if (!this.images) return null
    return this.showAnswer ? this.images.answer : this.images.plain
  }

  /** Where the open card sits and how it is scaled, or null when there is nothing to show. */
  private cardLayout(): { image: CardImage; scale: number; w: number; viewH: number; maxScroll: number } | null {
    const image = this.currentImage()
    if (!image || image.width <= 0 || image.height <= 0) return null
    let scale = (CARD_WIDTH * this.zoom) / image.width
    const maxW = FRAME_W - 2 * MARGIN
    if (image.width * scale > maxW) scale = maxW / image.width
    const w = image.width * scale
    const viewH = Math.min(image.height * scale, FRAME_H - 2 * MARGIN)
    const maxScroll = Math.max(0, image.height - viewH / scale)
    return { image, scale, w, viewH, maxScroll }
  }

  private drawCard(ctx: CanvasRenderingContext2D): void {
    const layout = this.open ? this.cardLayout() : null
    if (!layout) {
      this.drawTab(ctx)
      return
    }
    const { image, scale, w, viewH, maxScroll } = layout
    this.scroll = clamp(this.scroll, 0, maxScroll)
    const x = MARGIN
    const y = MARGIN

    ctx.save()
    roundRect(ctx, x, y, w, viewH, 12)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.clip()
    ctx.drawImage(image.image, 0, this.scroll, image.width, viewH / scale, x, y, w, viewH)
    ctx.restore()

    ctx.save()
    roundRect(ctx, x, y, w, viewH, 12)
    ctx.lineWidth = 2
    ctx.strokeStyle = '#d6d3d1'
    ctx.stroke()
    ctx.restore()

    if (maxScroll > 0) {
      // A scroll bar, so viewers know there is more of the question below.
      const track = viewH - 24
      const thumb = Math.max(28, (track * viewH) / (image.height * scale))
      const top = y + 12 + ((track - thumb) * this.scroll) / maxScroll
      ctx.save()
      ctx.fillStyle = 'rgba(12, 10, 9, 0.28)'
      roundRect(ctx, x + w - 9, top, 5, thumb, 2.5)
      ctx.fill()
      ctx.restore()
    }
  }

  /** The folded card: a small tab naming the question. */
  private drawTab(ctx: CanvasRenderingContext2D): void {
    const text = this.options.label
    ctx.save()
    ctx.font = `500 22px ${this.options.fontFamily}`
    const w = Math.ceil(ctx.measureText(text).width) + 32
    roundRect(ctx, MARGIN, MARGIN, w, 42, 10)
    ctx.fillStyle = '#0c0a09'
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, MARGIN + 16, MARGIN + 22)
    ctx.restore()
  }

  private drawBubble(ctx: CanvasRenderingContext2D): void {
    const video = this.webcam
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return
    const r = BUBBLE / 2
    const cx = FRAME_W - MARGIN - r
    const cy = FRAME_H - MARGIN - r
    const side = Math.min(video.videoWidth, video.videoHeight)
    const sx = (video.videoWidth - side) / 2
    const sy = (video.videoHeight - side) / 2

    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()
    ctx.drawImage(video, sx, sy, side, side, cx - r, cy - r, BUBBLE, BUBBLE)
    ctx.restore()

    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.lineWidth = 4
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#a8a29e'
    ctx.stroke()
    ctx.restore()
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.arcTo(x + w, y, x + w, y + radius, radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius)
  ctx.lineTo(x + radius, y + h)
  ctx.arcTo(x, y + h, x, y + h - radius, radius)
  ctx.lineTo(x, y + radius)
  ctx.arcTo(x, y, x + radius, y, radius)
  ctx.closePath()
}
