'use client'

import { Suspense, use, useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { CornersIn, Play } from '@/components/ui/icons'
import { parseYouTubeUrl, youTubeEmbedUrl, type YouTubeRef } from '@/lib/youtube/url'
import { loadSolutions } from './LazySolutionPanel'

/** The folded frame on a narrow pane, where there is no margin to sit in. */
const FOLDED_W = 320
/** The question column's width (max-w-4xl); the margin beside it is the dock's home. */
const COLUMN_W = 896
const MIN_MARGIN_W = 240
const FOLDED_H = 84
/** The open frame's own strip above the player. */
const HEADER_H = 44
/** Room kept between the open frame and the edges of the question pane. */
const GAP = 12
const MAX_OPEN_W = 820

/**
 * The video solution, docked at the bottom left of the question pane, just
 * above the action bar — only for a question that has a video. Folded, it is
 * a small "Watch the solution" card; a click grows it from that corner (the
 * corner stays put, the frame widens and rises) over part of the question,
 * never over the palette, and the video plays. The same click folds it back.
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

  // Folded, the frame fills the white margin left of the question column, so
  // on a wide screen it covers nothing; where that margin is too thin, it is a
  // fixed slip over the corner (the question keeps room below to scroll clear).
  const margin = (room.width - Math.min(room.width, COLUMN_W)) / 2 - GAP * 2
  const foldedWidth = Math.max(
    0,
    margin >= MIN_MARGIN_W ? Math.min(margin, 380) : Math.min(FOLDED_W, room.width - GAP * 2),
  )
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
      className="absolute bottom-3 left-3 z-20 overflow-hidden rounded-card border border-ink/10 bg-pal-marked shadow-[0_14px_40px_-16px_rgba(12,10,9,0.45)] transition-[width,height] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
      style={{ width: open ? openWidth : foldedWidth, height: open ? openHeight : FOLDED_H }}
    >
      {open ? (
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 px-3" style={{ height: HEADER_H }}>
            <p className="flex items-center gap-2 text-ui font-medium text-ink">
              <Play size={16} weight="fill" aria-hidden="true" />
              Watch the solution
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fold the video away"
              title="Fold away (Esc)"
              className="flex h-8 w-8 items-center justify-center rounded-control text-ink hover:bg-ink/10"
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
          className="group flex h-full w-full items-center gap-3 px-3 text-left"
        >
          <span className="relative h-[3.25rem] w-[5.75rem] shrink-0 overflow-hidden rounded-control bg-ink/80 ring-2 ring-ink/10">
            {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail, not a site image */}
            <img
              src={thumbnail}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover opacity-90 transition-transform duration-300 group-hover:scale-105"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-ink shadow transition-transform duration-200 group-hover:scale-110">
                <Play size={14} weight="fill" aria-hidden="true" />
              </span>
            </span>
          </span>
          <span className="min-w-0">
            <span className="block text-ui font-semibold text-ink">Watch the solution</span>
            <span className="line-clamp-2 block text-meta leading-snug text-ink/75">Popcorn optional, aha moment included.</span>
          </span>
          <Squiggle />
        </button>
      )}
    </div>
  )
}

/** A hand-drawn flourish in the card's free corner. */
function Squiggle() {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" className="ml-auto hidden h-8 w-8 shrink-0 text-ink/40 min-[360px]:block">
      <path
        d="M4 30c6-10 10 4 16-6s8-10 14-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="M30 14l5 6-7 2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
