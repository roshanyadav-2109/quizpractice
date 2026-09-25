import type { CSSProperties } from 'react'
import type { ImageBlock } from '@/lib/blocks/schema'
import { cloudinaryUrl, cloudinarySrcSet } from '@/lib/cloudinary'
import { FigureCaption, type BlockContext } from './BlockRenderer'
import { ZoomableFigure } from './ZoomableFigure'

/** How far a figure may shrink to fit the column before it scrolls sideways instead. */
const MIN_SCALE = 0.75

/**
 * The escape hatch: content whose meaning is spatial rather than structural —
 * circuit diagrams, waveforms, geometry figures, tool screenshots.
 *
 * Scanned figures are drawn in black on white. Inverting them in dark mode
 * would wreck the diagram, so the image sits on an explicit white card in both
 * themes instead. Alt text is required by the schema, which keeps these
 * questions searchable and readable by assistive tech.
 *
 * Figures cut from a paper often hold lines of text, and scaling a wide one
 * down to a phone would shrink that text past reading. So a figure shrinks
 * only so far, then scrolls sideways; tapping it opens it full size.
 */
export function ImageBlockView({ block, context = 'question' }: { block: ImageBlock; context?: BlockContext }) {
  const src = cloudinaryUrl(block.image, { width: 1024 })
  const srcSet = cloudinarySrcSet(block.image)

  if (!src) {
    return (
      <div className="rounded-control border border-dashed border-rule bg-surface-2 px-4 py-4 text-meta text-ink-muted">
        <p className="text-ink">Figure unavailable</p>
        <p className="mt-1">{block.alt}</p>
        <p className="mt-2 font-mono text-[0.75rem] text-ink-faint">
          Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME to display images.
        </p>
      </div>
    )
  }

  const { region, width, height } = block.image
  // Inside an option, a tap picks the option, so the figure just fits.
  const zoomable = context !== 'option'
  const inline: CSSProperties | undefined =
    zoomable && width ? { width, maxWidth: `max(100%, ${Math.round(width * MIN_SCALE)}px)` } : undefined

  const draw = (style: CSSProperties | undefined, className: string, full = false) =>
    region ? (
      // One figure out of a sheet holding the whole paper's figures: the
      // sheet loads once, and each figure is a window onto its part.
      <svg
        role="img"
        aria-label={block.alt}
        viewBox={`${region.x} ${region.y} ${region.width} ${region.height}`}
        width={full ? Math.max(region.width, width ?? 0) : width}
        height={full ? Math.round((Math.max(region.width, width ?? 0) * region.height) / region.width) : height}
        style={style}
        className={`block ${className}`}
      >
        <image href={src} width={region.sheet_width} height={region.sheet_height} />
      </svg>
    ) : (
      // Cloudinary already handles format negotiation, resizing and CDN
      // delivery; next/image would add a second optimiser in front of it.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        srcSet={srcSet}
        sizes={srcSet ? '(max-width: 768px) 100vw, 720px' : undefined}
        alt={block.alt}
        width={width}
        height={height}
        loading={full ? undefined : 'lazy'}
        style={style}
        // Crops of a paper's own lines read as text, so they start where
        // text does; drawn figures sit centred.
        className={`${block.image.delivery === 'original' ? '' : 'mx-auto'} ${className}`}
      />
    )

  const card = (
    <div className="overflow-x-auto rounded-control border border-rule bg-white p-3">
      {draw(inline, inline ? 'h-auto' : 'h-auto max-w-full')}
    </div>
  )

  return (
    <figure className="my-2">
      {zoomable ? (
        <ZoomableFigure label={block.alt} zoomed={draw(undefined, 'h-auto max-w-none', true)}>
          {card}
        </ZoomableFigure>
      ) : (
        card
      )}
      <FigureCaption>{block.caption}</FigureCaption>
    </figure>
  )
}
