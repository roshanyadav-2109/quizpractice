'use client'

import { Suspense, use, useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { CornersIn, Play } from '@/components/ui/icons'
import { parseYouTubeUrl, youTubeEmbedUrl, type YouTubeRef } from '@/lib/youtube/url'
import { loadSolutions } from './LazySolutionPanel'

/** The folded card: as wide as the white space before the question starts, within these bounds. */
const MIN_CARD_W = 112
const MAX_CARD_W = 420
const PAD = 8
/** Where there is no margin (tablet, phone): a slip of this width over the corner. */
const SLIP_W = 260
/** The open frame's own strip above the player. */
const HEADER_H = 48
/** Room kept between the frame and the edges of the question pane. */
const GAP = 12
const MAX_OPEN_W = 840

/** Open, a frame with no video in it only has a note to show, so it grows less. */
const NOTE_W = 440

/**
 * The video solution, docked at the bottom left of the question pane, just
 * above the action bar. Folded, it is a "Watch the solution" card; a click
 * grows it from that corner (the corner stays put, the frame widens and rises)
 * over part of the question, never over the palette, and the video plays.
 * Esc or the fold button shrinks it. A question without a video yet keeps the
 * same card, and opening it says the solution is on its way.
 *
 * It reads the explanations the explanation panel already loaded, so it costs
 * no extra request.
 */
interface Areas {
  /** The question pane the frame lives in and grows over. */
  bounds: RefObject<HTMLElement | null>
  /** The question column: the folded card stops just short of where its content starts. */
  column: RefObject<HTMLElement | null>
}

/** What the designed thumbnail says: the question's number and, where known, its subject. */
interface Caption {
  number: number
  subject?: string | null
}

export function SolutionVideoDock({ questionId, ...rest }: { questionId: string; caption: Caption } & Areas) {
  return (
    <Suspense fallback={null}>
      {/* Keyed by question: moving on folds the frame and stops the video. */}
      <Dock key={questionId} questionId={questionId} {...rest} />
    </Suspense>
  )
}

function Dock({ questionId, ...rest }: { questionId: string; caption: Caption } & Areas) {
  const solutions = use(loadSolutions(questionId))
  const url = solutions?.find((solution) => solution.video_url)?.video_url ?? null
  const video = url ? parseYouTubeUrl(url) : null
  return <Frame video={video} {...rest} />
}

function Frame({ video, bounds, column, caption }: { video: YouTubeRef | null; caption: Caption } & Areas) {
  const [open, setOpen] = useState(false)
  const [room, setRoom] = useState({ width: 960, height: 640, contentLeft: 0 })

  // The pane's size decides how far the frame may grow, and where the
  // question's content starts decides how wide the folded card may be.
  useLayoutEffect(() => {
    const pane = bounds.current
    if (!pane) return
    const measure = () => {
      const col = column.current
      let contentLeft = 0
      if (col) {
        const padding = parseFloat(getComputedStyle(col).paddingLeft) || 0
        contentLeft = col.getBoundingClientRect().left - pane.getBoundingClientRect().left + padding
      }
      setRoom({ width: pane.clientWidth, height: pane.clientHeight, contentLeft })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(pane)
    return () => observer.disconnect()
  }, [bounds, column])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Folded, the card fills the white space up to a little short of where the
  // question starts: the frame on top at 16:9, "Watch the solution" under it.
  const margin = Math.floor(room.contentLeft - GAP * 2)
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
    Math.round(
      Math.min(room.width - GAP * 2, video ? MAX_OPEN_W : NOTE_W, ((room.height - GAP * 2 - HEADER_H) * 16) / 9),
    ),
  )
  const openHeight = Math.round((openWidth * 9) / 16) + HEADER_H
  const embed = video ? `${youTubeEmbedUrl(video)}${video.start ? '&' : '?'}autoplay=1&rel=0&modestbranding=1` : null

  return (
    <div
      className="absolute bottom-3 left-3 z-20 overflow-hidden rounded-[6px] border border-[#134e4a] bg-[#115e59] text-white transition-[width,height] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
      style={{ width: open ? openWidth : foldedWidth, height: open ? openHeight : foldedHeight }}
    >
      {open ? (
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center gap-3 px-4" style={{ height: HEADER_H }}>
            <span className="flex h-7 w-7 items-center justify-center rounded-[4px] bg-white/15 text-white">
              <Play size={12} weight="fill" aria-hidden="true" />
            </span>
            <p className="min-w-0 flex-1 truncate">
              <span className="text-ui font-semibold">Video solution</span>
              <span className="ml-2 hidden text-meta text-white/60 sm:inline">Esc to fold away</span>
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fold the video away"
              title="Fold away (Esc)"
              className="flex h-8 w-8 items-center justify-center rounded-[4px] text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <CornersIn size={18} aria-hidden="true" />
            </button>
          </div>
          {embed ? (
            <iframe
              src={embed}
              title="Video solution"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="min-h-0 w-full flex-1 bg-black"
            />
          ) : (
            <ComingSoon />
          )}
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
          <BoardThumbnail caption={caption} height={frameH} />
          <span className="flex items-center px-0.5 text-ui leading-tight font-normal text-white group-hover:text-[#ccfbf1]" style={{ minHeight: textH }}>
            Watch the solution
          </span>
        </button>
      )}
    </div>
  )
}

/** In place of the player, while the video for this question is still being made: on the same squared paper as the card. */
function ComingSoon() {
  return (
    <div
      role="status"
      className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-1.5 bg-white px-6 text-center"
      style={{
        backgroundImage: `linear-gradient(to right, rgba(15,118,110,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,118,110,0.08) 1px, transparent 1px)`,
        backgroundSize: '16px 16px',
      }}
    >
      <p className="text-[1.5rem] leading-tight font-semibold text-ink">Uh oh!</p>
      <p className="max-w-[26rem] text-ui text-ink-muted">We are working on the video solution for this question.</p>
      <p className="mt-1 rounded-[4px] bg-[#d5eee9] px-2 py-0.5 text-meta font-medium text-[#0f766e]">Coming soon</p>
    </div>
  )
}

/**
 * The frame's picture, drawn rather than taken from the video: a page of the
 * teacher's board — squared paper, the question's number written large with a
 * marker stroke under it, the subject in the corner and a play button. It
 * stays sharp at any size and costs no image request.
 */
function BoardThumbnail({ caption, height }: { caption: Caption; height: number }) {
  // Everything scales with the frame, so a narrow card reads like a wide one.
  const unit = Math.max(0.7, Math.min(1.4, height / 110))
  const grid = Math.round(14 * unit)
  return (
    <span
      aria-hidden="true"
      className="relative block w-full shrink-0 overflow-hidden rounded-[4px] bg-white ring-1 ring-white/20"
      style={{
        height,
        backgroundImage: `linear-gradient(to right, rgba(15,118,110,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,118,110,0.08) 1px, transparent 1px)`,
        backgroundSize: `${grid}px ${grid}px`,
      }}
    >
      {caption.subject ? (
        <span
          className="absolute top-[7%] left-[6%] max-w-[70%] truncate rounded-[3px] bg-[#d5eee9] px-1.5 py-0.5 font-medium tracking-[0.06em] text-[#0f766e] uppercase"
          style={{ fontSize: 9 * unit }}
        >
          {caption.subject}
        </span>
      ) : null}

      <span className="absolute bottom-[14%] left-[6%] flex flex-col items-start">
        <span className="relative leading-none font-semibold text-ink tabular-nums" style={{ fontSize: 34 * unit }}>
          Q{caption.number}
          {/* The marker stroke under the number, as a teacher would underline it. */}
          <svg
            viewBox="0 0 100 12"
            preserveAspectRatio="none"
            className="absolute -bottom-[0.28em] left-[-4%] h-[0.3em] w-[112%] text-[#0f766e]"
          >
            <path d="M2 8 C 20 3, 45 11, 62 6 S 90 4, 98 7" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="mt-[0.55em] text-ink-muted" style={{ fontSize: 11 * unit }}>
          solution
        </span>
      </span>

      <span
        className="absolute right-[7%] bottom-[12%] flex items-center justify-center rounded-full bg-[#0f766e] text-white transition-transform duration-200 group-hover:scale-110"
        style={{ width: 30 * unit, height: 30 * unit }}
      >
        <Play size={Math.round(13 * unit)} weight="fill" />
      </span>
    </span>
  )
}

