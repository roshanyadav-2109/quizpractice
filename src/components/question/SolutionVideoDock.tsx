'use client'

import { Suspense, use, useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { CornersIn, Play } from '@/components/ui/icons'
import { parseYouTubeUrl, youTubeEmbedUrl, type YouTubeRef } from '@/lib/youtube/url'
import { loadSolutions } from './LazySolutionPanel'

/** The question column's width (max-w-4xl): the white margin beside it is the card's home. */
const COLUMN_W = 896
/** The folded card: as wide as that margin, within these bounds. */
const MIN_CARD_W = 112
const MAX_CARD_W = 280
const PAD = 8
/** Where there is no margin (tablet, phone): a slip of this width over the corner. */
const SLIP_W = 260
/** The open frame's own strip above the player. */
const HEADER_H = 48
/** Room kept between the frame and the edges of the question pane. */
const GAP = 12
const MAX_OPEN_W = 840

/**
 * The video solution, docked at the bottom left of the question pane, just
 * above the action bar — only for a question that has a video. Folded, it is
 * a "Watch the solution" card; a click grows it from that corner (the corner
 * stays put, the frame widens and rises) over part of the question, never
 * over the palette, and the video plays. Esc or the fold button shrinks it.
 *
 * It reads the explanations the explanation panel already loaded, so it costs
 * no extra request.
 */
export function SolutionVideoDock({ questionId, bounds }: { questionId: string; bounds: RefObject<HTMLElement | null> }) {
  return (
    <Suspense fallback={null}>
      {/* Keyed by question: moving on folds the frame and stops the video. */}
      <Dock key={questionId} questionId={questionId} bounds={bounds} />
    </Suspense>
  )
}

function Dock({ questionId, bounds }: { questionId: string; bounds: RefObject<HTMLElement | null> }) {
  const solutions = use(loadSolutions(questionId))
  const url = solutions?.find((solution) => solution.video_url)?.video_url ?? null
  const video = url ? parseYouTubeUrl(url) : null
  if (!video) return null
  return <Frame video={video} bounds={bounds} />
}

function Frame({ video, bounds }: { video: YouTubeRef; bounds: RefObject<HTMLElement | null> }) {
  const [open, setOpen] = useState(false)
  const [room, setRoom] = useState({ width: 960, height: 640 })

  // The pane's size decides how far the frame may grow.
  useLayoutEffect(() => {
    const pane = bounds.current
    if (!pane) return
    const measure = () => setRoom({ width: pane.clientWidth, height: pane.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(pane)
    return () => observer.disconnect()
  }, [bounds])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Folded, the card is exactly as wide as the white margin left of the
  // question column: the frame on top, "Watch the solution" under it.
  const margin = Math.floor((room.width - Math.min(room.width, COLUMN_W)) / 2 - GAP * 2)
  const inMargin = margin >= MIN_CARD_W
  const foldedWidth = inMargin ? Math.min(margin, MAX_CARD_W) : Math.max(0, Math.min(SLIP_W, room.width - GAP * 2))
  const frameH = Math.round(((foldedWidth - PAD * 2) * 9) / 16)
  // The words take two lines on a narrow card, one on a wide one.
  const textH = foldedWidth - PAD * 2 < 170 ? 40 : 22
  const foldedHeight = frameH + PAD * 3 + textH
  // As wide as the pane allows, and short enough that the player never runs
  // off the top: 16:9 under the strip.
  const openWidth = Math.max(
    foldedWidth,
    Math.round(Math.min(room.width - GAP * 2, MAX_OPEN_W, ((room.height - GAP * 2 - HEADER_H) * 16) / 9)),
  )
  const openHeight = Math.round((openWidth * 9) / 16) + HEADER_H
  const thumbnail = `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`
  const embed = `${youTubeEmbedUrl(video)}${video.start ? '&' : '?'}autoplay=1&rel=0&modestbranding=1`

  return (
    <div
      className="absolute bottom-3 left-3 z-20 overflow-hidden rounded-[6px] border border-accent/25 bg-accent-soft text-ink shadow-[0_14px_36px_-18px_rgba(29,78,216,0.45),0_2px_5px_-2px_rgba(12,10,9,0.12)] transition-[width,height] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
      style={{ width: open ? openWidth : foldedWidth, height: open ? openHeight : foldedHeight }}
    >
      {open ? (
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center gap-3 px-4" style={{ height: HEADER_H }}>
            <span className="flex h-7 w-7 items-center justify-center rounded-[4px] bg-accent text-white">
              <Play size={12} weight="fill" aria-hidden="true" />
            </span>
            <p className="min-w-0 flex-1 truncate">
              <span className="text-ui font-semibold">Video solution</span>
              <span className="ml-2 hidden text-meta text-ink-muted sm:inline">Esc to fold away</span>
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fold the video away"
              title="Fold away (Esc)"
              className="flex h-8 w-8 items-center justify-center rounded-[4px] text-ink-muted transition-colors hover:bg-accent/10 hover:text-ink"
            >
              <CornersIn size={18} aria-hidden="true" />
            </button>
          </div>
          <iframe
            src={embed}
            title="Video solution"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="min-h-0 w-full flex-1 bg-black"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-label="Watch the video solution"
          className="group flex h-full w-full flex-col text-left"
          style={{ padding: PAD, gap: PAD }}
        >
          <span
            className="relative w-full shrink-0 overflow-hidden rounded-[4px] bg-surface ring-1 ring-accent/20"
            style={{ height: frameH }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail, not a site image */}
            <img
              src={thumbnail}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
            <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white shadow-md transition-transform duration-200 group-hover:scale-110">
                <Play size={14} weight="fill" />
              </span>
            </span>
          </span>
          <span className="flex items-center px-0.5 text-ui leading-tight font-semibold text-ink group-hover:text-accent" style={{ minHeight: textH }}>
            Watch the solution
          </span>
        </button>
      )}
    </div>
  )
}
