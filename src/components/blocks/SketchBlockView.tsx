import { sketchBlockSchema, type SketchBlock } from '@/lib/blocks/schema'
import { figureImageUrl, sketchToSvgPaths, type SketchPath } from '@/lib/board/sketch'
import { DOT_COLOR, DOT_RADIUS, GRID_COLOR, GRID_STEP } from '@/lib/board/types'
import { FigureCaption, type BlockContext } from './BlockRenderer'
import { ZoomableFigure } from './ZoomableFigure'

/** Path data may hold only these commands and numbers — nothing that could smuggle markup or a URL. */
const SAFE_PATH = /^[MLQCZmlqcz0-9.,\s-]+$/
const SAFE_COLOR = /^(#[0-9a-fA-F]{6}|none)$/

/**
 * A page from a teacher's whiteboard, drawn as inline SVG from its stored
 * strokes: sharp at any zoom, and no image to upload or load.
 *
 * Like a scanned figure it is ink on paper, so it sits on a white card in
 * both themes rather than being inverted. No hooks: it renders on the server
 * (the admin review queue) and in the browser (the student's solution sheet)
 * alike. A tap opens it full size, where a phone's column is too narrow to
 * read handwriting.
 */
export function SketchBlockView({ block: stored, context = 'solution' }: { block: SketchBlock; context?: BlockContext }) {
  // The body is checked when it is saved, but a row can be written around
  // the app; a malformed drawing shows its description rather than breaking
  // the explanation around it.
  const checked = sketchBlockSchema.safeParse(stored)
  if (!checked.success) {
    const alt = typeof stored?.alt === 'string' ? stored.alt.trim() : ''
    return (
      <div className="my-2 rounded-control border border-dashed border-rule bg-surface-2 px-4 py-3 text-meta text-ink-muted">
        <p className="text-ink">This board drawing could not be shown.</p>
        {alt ? <p className="mt-1">{alt}</p> : null}
      </div>
    )
  }
  const block = checked.data
  const label = block.alt.trim() || 'Board drawing'
  const zoomable = context !== 'option' && context !== 'compact'

  // Outlines are worked out once and shared by the card and its enlargement.
  const paths = sketchToSvgPaths(block)
  const draw = (className: string) => <SketchSvg block={block} paths={paths} label={label} className={className} />

  const card = <div className="overflow-hidden rounded-control border border-rule bg-white">{draw('block h-auto w-full')}</div>

  return (
    <figure className="my-2">
      {zoomable ? (
        <ZoomableFigure label={label} zoomed={draw('block h-auto w-[min(1280px,calc(100vw-2rem))] max-w-none')}>
          {card}
        </ZoomableFigure>
      ) : (
        card
      )}
      <FigureCaption>{block.caption}</FigureCaption>
    </figure>
  )
}

function SketchSvg({
  block,
  paths,
  label,
  className,
}: {
  block: SketchBlock
  paths: SketchPath[]
  label: string
  className: string
}) {
  const { w, h } = block

  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className={className}>
      <rect width={w} height={h} fill="#ffffff" />
      <Ruling bg={block.bg ?? 'plain'} w={w} h={h} />

      {block.figures?.map((figure, index) => {
        const href = figureImageUrl(figure.image)
        if (!href) return null
        const region = figure.image.region
        // A figure cut from a sheet: a window onto its part of the sheet.
        return region ? (
          <svg
            key={index}
            x={figure.x}
            y={figure.y}
            width={figure.w}
            height={figure.h}
            viewBox={`${region.x} ${region.y} ${region.width} ${region.height}`}
            preserveAspectRatio="none"
          >
            <image href={href} width={region.sheet_width} height={region.sheet_height} />
          </svg>
        ) : (
          <image
            key={index}
            href={href}
            x={figure.x}
            y={figure.y}
            width={figure.w}
            height={figure.h}
            // Filled exactly as the board's canvas draws it, so ink written over the figure lines up.
            preserveAspectRatio="none"
          />
        )
      })}

      {paths.map((path, index) =>
        SAFE_PATH.test(path.d) && SAFE_COLOR.test(path.fill) && (!path.stroke || SAFE_COLOR.test(path.stroke)) ? (
          <path
            key={index}
            d={path.d}
            fill={path.fill}
            stroke={path.stroke}
            strokeWidth={path.strokeWidth}
            strokeLinecap={path.stroke ? 'round' : undefined}
            strokeLinejoin={path.stroke ? 'round' : undefined}
            opacity={path.opacity === 1 ? undefined : path.opacity}
            // Highlighter ink multiplies, so the writing under it stays dark.
            style={path.multiply ? { mixBlendMode: 'multiply' } : undefined}
          />
        ) : null,
      )}
    </svg>
  )
}

/** Squared or dotted paper, matching the board. Dots are round caps on zero-length lines. */
function Ruling({ bg, w, h }: { bg: 'plain' | 'grid' | 'dots'; w: number; h: number }) {
  if (bg === 'plain') return null
  const xs: number[] = []
  const ys: number[] = []
  for (let x = GRID_STEP; x < w; x += GRID_STEP) xs.push(x)
  for (let y = GRID_STEP; y < h; y += GRID_STEP) ys.push(y)

  if (bg === 'grid') {
    const d = [...xs.map((x) => `M${x} 0V${h}`), ...ys.map((y) => `M0 ${y}H${w}`)].join('')
    return <path d={d} stroke={GRID_COLOR} strokeWidth={1} fill="none" />
  }
  const d = xs.flatMap((x) => ys.map((y) => `M${x} ${y}h0`)).join('')
  return <path d={d} stroke={DOT_COLOR} strokeWidth={DOT_RADIUS * 2} strokeLinecap="round" fill="none" />
}
