import { blocksToText, type Block, type CloudinaryRef } from '@/lib/blocks/schema'
import { figureImageUrl } from '@/lib/board/sketch'
import type { CardImage, CardImages } from './compositor'
import type { QuestionOptionRow, QuestionWithOptions } from '@/types/db'

/**
 * The question card on the recording, as two pictures: the question with its
 * options, and the same with the answer marked. The teacher flips between
 * them with "Show answer on video".
 *
 * The pictures are taken of the real QuestionWithAnswer, rendered off screen
 * at a fixed width, with modern-screenshot — so the video shows exactly what
 * the site shows: KaTeX, highlighted code, tables and figures. That library
 * draws the page through an SVG, which some browsers (Safari especially)
 * refuse, and a refused picture would spoil the whole recording. So every
 * picture is checked, and when one fails a plain painter draws the card
 * instead: the question as wrapped text, its figures fetched from Cloudinary
 * with CORS, and its options with the answer ticked.
 *
 * Browser only.
 */

/** The card's width in CSS pixels; the pictures are twice that. */
export const CARD_CSS_WIDTH = 640
export const CARD_SCALE = 2
/** A picture wider than this is not worth drawing: the card would be unreadable on the video. */
const MAX_CSS_WIDTH = 1400
const IMAGE_TIMEOUT_MS = 10_000

export type CardQuestion = Pick<
  QuestionWithOptions,
  'number' | 'type' | 'marks' | 'negative_marks' | 'body' | 'correct_answer' | 'answer_tolerance'
> & { options: Pick<QuestionOptionRow, 'id' | 'label' | 'content' | 'is_correct'>[] }

export interface CardRaster {
  images: CardImages
  /** True when the plain painter drew the card, not the screenshot. */
  fallback: boolean
}

/**
 * Pictures of the two rendered cards, or of the painted fallback when the
 * browser will not take them.
 */
export async function rasterizeCard(
  nodes: { plain: HTMLElement; answer: HTMLElement },
  question: CardQuestion,
  fonts: { sans: string; mono: string },
  { hideLabels = false }: { hideLabels?: boolean } = {},
): Promise<CardRaster> {
  try {
    await prepare(nodes.plain)
    await prepare(nodes.answer)
    const { domToCanvas } = await import('modern-screenshot')
    const plain = await capture(domToCanvas, nodes.plain)
    const answer = await capture(domToCanvas, nodes.answer)
    return { images: { plain, answer }, fallback: false }
  } catch {
    const [plain, answer] = await Promise.all([
      paintCard(question, { showAnswer: false, hideLabels, fonts }),
      paintCard(question, { showAnswer: true, hideLabels, fonts }),
    ])
    return { images: { plain, answer }, fallback: true }
  }
}

/** Fonts loaded and figures fetched, so the picture is not taken half-drawn. */
async function prepare(node: HTMLElement): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await Promise.race([document.fonts.ready, wait(3000)])
  }
  const images = Array.from(node.querySelectorAll('img'))
  for (const img of images) img.loading = 'eager'
  await Promise.race([
    Promise.all(images.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined)))),
    wait(IMAGE_TIMEOUT_MS),
  ])
}

type DomToCanvas = (typeof import('modern-screenshot'))['domToCanvas']

async function capture(domToCanvas: DomToCanvas, node: HTMLElement): Promise<CardImage> {
  const width = Math.min(Math.max(node.scrollWidth, CARD_CSS_WIDTH), MAX_CSS_WIDTH)
  const canvas = await domToCanvas(node, {
    scale: CARD_SCALE,
    width,
    backgroundColor: '#ffffff',
    timeout: IMAGE_TIMEOUT_MS,
    fetch: { requestInit: { mode: 'cors', cache: 'force-cache' } },
    // The enlarge dialogs of figures are page furniture, not the question.
    filter: (el) => el.nodeName !== 'DIALOG',
  })
  if (!canvas.width || !canvas.height) throw new Error('Empty picture.')
  if (!readableAndDrawn(canvas)) throw new Error('Unusable picture.')
  return { image: canvas, width: canvas.width, height: canvas.height }
}

/**
 * A picture the recording can use: not tainted (reading it would throw, and
 * drawing it would black out the video) and not blank (some browsers answer
 * an SVG they cannot draw with an empty image).
 */
function readableAndDrawn(canvas: HTMLCanvasElement): boolean {
  try {
    const probe = document.createElement('canvas')
    probe.width = 48
    probe.height = 48
    const ctx = probe.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 48, 48)
    ctx.drawImage(canvas, 0, 0, 48, 48)
    const { data } = ctx.getImageData(0, 0, 48, 48)
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) return true
    }
    return false
  } catch {
    return false
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// The plain painter
// ---------------------------------------------------------------------------

const INK = '#0c0a09'
const MUTED = '#57534e'
const FAINT = '#78716c'
const CORRECT = '#15803d'
const CORRECT_SOFT = '#f0fdf4'
const RULE = '#e7e5e4'

type Item =
  | { kind: 'text'; lines: string[]; font: string; color: string; lineHeight: number; indent: number; fill?: string }
  | { kind: 'image'; img: HTMLImageElement; sx: number; sy: number; sw: number; sh: number; w: number; h: number; indent: number }
  | { kind: 'gap'; h: number }
  | { kind: 'rule' }

/** Draws the card from the question's data alone: words, figures and the answer. */
export async function paintCard(
  question: CardQuestion,
  {
    showAnswer,
    hideLabels,
    fonts,
  }: { showAnswer: boolean; hideLabels: boolean; fonts: { sans: string; mono: string } },
): Promise<CardImage> {
  const s = CARD_SCALE
  const width = CARD_CSS_WIDTH * s
  const pad = 22 * s
  const inner = width - 2 * pad

  const measuring = document.createElement('canvas').getContext('2d')
  if (!measuring) throw new Error('This browser cannot draw the question card.')
  const measure: CanvasRenderingContext2D = measuring

  const sans = (size: number, weight = 400) => `${weight} ${size * s}px ${fonts.sans}`
  const mono = (size: number) => `400 ${size * s}px ${fonts.mono}`
  const items: Item[] = []

  const text = (value: string, font: string, color: string, lineHeight: number, indent = 0, fill?: string) => {
    const lines = wrap(measure, value, font, inner - indent)
    if (lines.length) items.push({ kind: 'text', lines, font, color, lineHeight: lineHeight * s, indent, fill })
  }
  const gap = (h: number) => items.push({ kind: 'gap', h: h * s })

  // Heading: "Question 7 · 2 marks · MCQ"
  const marks = Number(question.marks)
  const negative = Number(question.negative_marks)
  const heading = [
    `Question ${question.number}`,
    `${marks} mark${marks === 1 ? '' : 's'}${negative > 0 ? ` (−${negative} if wrong)` : ''}`,
    typeLabel(question.type),
  ].join('  ·  ')
  text(heading, sans(15, 500), INK, 22)
  items.push({ kind: 'rule' })
  gap(10)

  await blockItems(question.body, 0)

  if (question.options.length) {
    gap(8)
    if (question.type === 'msq') text('Select all that apply.', sans(13), FAINT, 19)
    for (const option of question.options) {
      gap(6)
      const correct = showAnswer && option.is_correct
      const label = hideLabels ? '•' : `(${option.label})`
      // A figure's alt text says nothing a viewer needs: the figure is drawn below instead.
      const words = plainMarkdown(blocksToText(option.content.filter((block) => block.type !== 'image')))
      const line = `${correct ? '✓ ' : ''}${label}${words ? `  ${words}` : ''}${correct ? (words ? '   — correct' : '  Correct') : ''}`
      text(line, sans(15, correct ? 500 : 400), correct ? CORRECT : INK, 23, 0, correct ? CORRECT_SOFT : undefined)
      await blockItems(
        option.content.filter((block) => block.type === 'image'),
        16 * s,
      )
    }
  }

  if (showAnswer && question.correct_answer && !question.options.length) {
    gap(12)
    const tolerance = Number(question.answer_tolerance) > 0 ? ` (±${Number(question.answer_tolerance)})` : ''
    text(`Answer: ${question.correct_answer}${tolerance}`, sans(15, 500), CORRECT, 23, 0, CORRECT_SOFT)
  }

  async function blockItems(blocks: Block[], indent: number) {
    for (const block of blocks) {
      switch (block.type) {
        case 'text':
          for (const paragraph of plainMarkdown(block.md).split(/\n{2,}/)) {
            text(paragraph.replace(/\n/g, ' '), sans(16), INK, 25, indent)
            gap(6)
          }
          break
        case 'math':
          text(block.latex, mono(14), INK, 22, indent + 12 * s)
          gap(6)
          break
        case 'code': {
          // Code keeps its indentation and blank lines; a line too long for the card is broken, not reflowed.
          const font = mono(13)
          const lines = block.source
            .replace(/\s+$/, '')
            .split('\n')
            .flatMap((line) => breakLine(measure, line.replace(/\t/g, '    '), font, inner - indent - 8 * s))
          items.push({ kind: 'text', lines, font, color: INK, lineHeight: 20 * s, indent: indent + 8 * s })
          gap(8)
          break
        }
        case 'table':
          if (block.caption) text(block.caption, sans(14), MUTED, 21, indent)
          text(block.columns.join('  |  '), sans(14, 500), INK, 21, indent)
          for (const row of block.rows) text(row.map((cell) => (cell ?? '').toString()).join('  |  '), sans(14), INK, 21, indent)
          gap(8)
          break
        case 'image': {
          const drawn = await imageItem(block.image, inner - indent, indent)
          if (drawn) items.push(drawn)
          else text(`[Figure: ${block.alt}]`, sans(14), MUTED, 21, indent)
          if (block.caption) text(block.caption, sans(13), MUTED, 19, indent)
          gap(8)
          break
        }
        default:
          text(blocksToText([block]), sans(15), INK, 23, indent)
          gap(6)
      }
    }
  }

  // Measure, then draw.
  let height = pad
  for (const item of items) height += itemHeight(item)
  height += pad

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.max(Math.ceil(height), 80 * s)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot draw the question card.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textBaseline = 'top'

  let y = pad
  for (const item of items) {
    if (item.kind === 'text') {
      const h = item.lines.length * item.lineHeight
      if (item.fill) {
        ctx.fillStyle = item.fill
        ctx.fillRect(pad - 8 * s, y - 3 * s, inner + 16 * s, h + 6 * s)
      }
      ctx.font = item.font
      ctx.fillStyle = item.color
      item.lines.forEach((line, index) => {
        ctx.fillText(line, pad + item.indent, y + index * item.lineHeight + (item.lineHeight * 0.12))
      })
      y += h
    } else if (item.kind === 'image') {
      try {
        ctx.drawImage(item.img, item.sx, item.sy, item.sw, item.sh, pad + item.indent, y, item.w, item.h)
      } catch {
        // Decoding failed after all: leave the space.
      }
      y += item.h
    } else if (item.kind === 'rule') {
      ctx.fillStyle = RULE
      ctx.fillRect(pad, y + 6 * s, inner, 1 * s)
      y += 13 * s
    } else {
      y += item.h
    }
  }

  return { image: canvas, width: canvas.width, height: canvas.height }
}

function itemHeight(item: Item): number {
  switch (item.kind) {
    case 'text':
      return item.lines.length * item.lineHeight
    case 'image':
      return item.h
    case 'rule':
      return 13 * CARD_SCALE
    case 'gap':
      return item.h
  }
}

/** A figure fitted to the card's width, or null when it cannot be fetched with CORS. */
async function imageItem(ref: CloudinaryRef, maxWidth: number, indent: number): Promise<Item | null> {
  const url = figureImageUrl(ref)
  if (!url) return null
  const img = await loadImage(url)
  if (!img || !img.naturalWidth) return null
  const region = ref.region
  const scaleX = region ? img.naturalWidth / region.sheet_width : 1
  const scaleY = region ? img.naturalHeight / region.sheet_height : 1
  const sx = region ? region.x * scaleX : 0
  const sy = region ? region.y * scaleY : 0
  const sw = region ? region.width * scaleX : img.naturalWidth
  const sh = region ? region.height * scaleY : img.naturalHeight
  // Shown at its display size where known (twice, for the picture's scale), never wider than the card.
  const natural = (region?.width ?? ref.width ?? sw) * CARD_SCALE
  const w = Math.min(maxWidth, natural)
  const h = (w * sh) / sw
  return { kind: 'image', img, sx, sy, sw, sh, w, h, indent }
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const timer = setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }
    img.src = url
  })
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

/**
 * Markdown as it reads: emphasis marks, headings, links, escapes and HTML
 * entities dropped (imported papers carry "&lt;/w&gt;"); $maths$ kept as written.
 */
export function plainMarkdown(md: string): string {
  return md
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, name: string) => ENTITIES[name] ?? '')
    .replace(/\r/g, '')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!|])/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

/** Lines of `text` no wider than `max` in `font`; a word too long for a line is broken. */
function wrap(ctx: CanvasRenderingContext2D, text: string, font: string, max: number): string[] {
  ctx.font = font
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (!words.length) return text.trim() ? [text.trim()] : []
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width <= max) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    if (ctx.measureText(word).width <= max) {
      line = word
      continue
    }
    // A word wider than the card: break it wherever it overflows.
    let piece = ''
    for (const char of word) {
      if (ctx.measureText(piece + char).width > max && piece) {
        lines.push(piece)
        piece = char
      } else {
        piece += char
      }
    }
    line = piece
  }
  if (line) lines.push(line)
  return lines
}

/** One line of code, broken wherever it would overflow; spaces are kept. */
function breakLine(ctx: CanvasRenderingContext2D, line: string, font: string, max: number): string[] {
  ctx.font = font
  if (ctx.measureText(line).width <= max) return [line]
  const out: string[] = []
  let piece = ''
  for (const char of line) {
    if (piece && ctx.measureText(piece + char).width > max) {
      out.push(piece)
      piece = '  ' + char
    } else {
      piece += char
    }
  }
  out.push(piece)
  return out
}

function typeLabel(type: CardQuestion['type']): string {
  switch (type) {
    case 'mcq':
      return 'One correct option'
    case 'msq':
      return 'One or more correct options'
    case 'numerical':
      return 'Numerical answer'
    case 'programming':
      return 'Programming'
    default:
      return 'Written answer'
  }
}
