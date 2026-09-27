'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CaretLeft, CaretRight, FilePlus, Trash } from '@/components/ui/icons'
import { pageIsEmpty, type BoardCommand } from '@/lib/board/model'
import { drawPage, type FigureImages } from '@/lib/board/render'
import { BOARD_H, MAX_PAGES, pageWidth, type BoardPage } from '@/lib/board/types'

const THUMB_W = 128
const THUMB_H = 72

/**
 * The board's pages as thumbnails, redrawn from their strokes: pick one to
 * switch to it, add a page, or delete the one on show.
 */
export function PageStrip({
  pages,
  current,
  images,
  dispatch,
}: {
  pages: BoardPage[]
  current: number
  images: FigureImages
  dispatch: (command: BoardCommand) => void
}) {
  const imagesVersion = useSyncExternalStore(images.subscribe, images.getVersion, () => 0)
  const list = useRef<HTMLOListElement>(null)
  // The id of the page awaiting "delete?" confirmation; any other page shows no prompt.
  const [confirming, setConfirming] = useState<string | null>(null)
  const page = pages[current]

  // Keep the current thumbnail in view by scrolling the strip alone:
  // scrollIntoView would scroll the whole page to the strip as well.
  useEffect(() => {
    const strip = list.current
    const item = strip?.children[current] as HTMLElement | undefined
    if (!strip || !item) return
    if (item.offsetLeft < strip.scrollLeft) {
      strip.scrollLeft = item.offsetLeft
    } else if (item.offsetLeft + item.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = item.offsetLeft + item.offsetWidth - strip.clientWidth
    }
  }, [current, pages.length])

  const remove = () => {
    if (pageIsEmpty(page) || confirming === page.id) {
      setConfirming(null)
      dispatch({ type: 'deletePage', index: current })
    } else {
      setConfirming(page.id)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <IconButton label="Previous page (Page Up)" disabled={current === 0} onClick={() => dispatch({ type: 'goto', index: current - 1 })}>
        <CaretLeft size={18} />
      </IconButton>

      <ol ref={list} aria-label="Board pages" className="rail relative flex min-w-0 flex-1 gap-2 overflow-x-auto px-0.5 py-1">
        {pages.map((item, index) => (
          <li key={item.id} className="shrink-0">
            <button
              type="button"
              aria-label={`Page ${index + 1}`}
              aria-current={index === current ? 'page' : undefined}
              onClick={() => dispatch({ type: 'goto', index })}
              className={`relative block overflow-hidden rounded-control border bg-white ${index === current ? 'border-ink ring-1 ring-ink' : 'border-rule hover:border-rule-strong'}`}
            >
              <PageThumb page={item} images={images} imagesVersion={imagesVersion} />
              <span className="absolute right-1 bottom-1 rounded-sm bg-white/90 px-1 text-micro text-ink-muted tabular-nums">
                {index + 1}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <IconButton
        label="Next page (Page Down)"
        disabled={current >= pages.length - 1}
        onClick={() => dispatch({ type: 'goto', index: current + 1 })}
      >
        <CaretRight size={18} />
      </IconButton>

      <p className="hidden px-1 text-meta whitespace-nowrap text-ink-muted tabular-nums sm:block" aria-live="polite">
        Page {current + 1} of {pages.length}
      </p>

      <IconButton label="New page (N)" disabled={pages.length >= MAX_PAGES} onClick={() => dispatch({ type: 'addPage' })}>
        <FilePlus size={18} />
      </IconButton>

      {confirming === page.id ? (
        <div className="flex items-center gap-1" role="group" aria-label={`Delete page ${current + 1}?`}>
          <span className="px-1 text-meta whitespace-nowrap text-ink">Delete page {current + 1}?</span>
          <button
            type="button"
            onClick={remove}
            className="inline-flex h-9 items-center rounded-control border border-rule bg-surface px-3 text-meta text-incorrect hover:border-incorrect/40 hover:bg-incorrect-soft"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className="inline-flex h-9 items-center rounded-control px-3 text-meta text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            Keep
          </button>
        </div>
      ) : (
        <IconButton label="Delete this page" disabled={pages.length <= 1} onClick={remove}>
          <Trash size={18} />
        </IconButton>
      )}
    </div>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}

/** One page, drawn small. Redrawn a moment after it changes, not on every stroke. */
function PageThumb({ page, images, imagesVersion }: { page: BoardPage; images: FigureImages; imagesVersion: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const element = canvas.current
      const ctx = element?.getContext('2d')
      if (!element || !ctx) return
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      element.width = Math.round(THUMB_W * ratio)
      element.height = Math.round(THUMB_H * ratio)
      // A wide page keeps its shape in the thumbnail, centred.
      const pw = pageWidth(page)
      const scale = Math.min(element.width / pw, element.height / BOARD_H)
      ctx.setTransform(scale, 0, 0, scale, (element.width - pw * scale) / 2, (element.height - BOARD_H * scale) / 2)
      drawPage(ctx, page, images)
    }, 150)
    return () => window.clearTimeout(timer)
  }, [page, images, imagesVersion])

  return <canvas ref={canvas} width={THUMB_W} height={THUMB_H} aria-hidden className="block h-[72px] w-32" />
}
