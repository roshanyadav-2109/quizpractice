'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { ArrowRight, CaretLeft, CaretRight } from '@/components/ui/icons'

export interface CarouselPaper {
  setId: string
  subject: string
  exam: string
  session: string
  setCode: string
  art: string | null
}

/** Soft grounds that cycle across the cards — decoration, not data. */
const GROUNDS = ['bg-[#ece8fc]', 'bg-[#dcf1f3]', 'bg-[#fce8ee]', 'bg-[#e1ecfd]', 'bg-[#fdf1dc]']

/** A row of paper cards that scrolls sideways, by swipe or by the arrows. */
export function PaperCarousel({ papers }: { papers: CarouselPaper[] }) {
  const track = useRef<HTMLUListElement>(null)

  function scroll(direction: 1 | -1) {
    const node = track.current
    if (!node) return
    node.scrollBy({ left: direction * Math.max(260, node.clientWidth * 0.8), behavior: 'smooth' })
  }

  return (
    <div>
      <div className="absolute top-5 right-5 flex gap-1 sm:top-6 sm:right-6">
        <button
          type="button"
          onClick={() => scroll(-1)}
          aria-label="Previous papers"
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2 hover:text-ink"
        >
          <CaretLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => scroll(1)}
          aria-label="More papers"
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2 hover:text-ink"
        >
          <CaretRight size={18} />
        </button>
      </div>

      <ul
        ref={track}
        className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {papers.map((paper, i) => (
          <li key={paper.setId} className="w-[236px] shrink-0 snap-start">
            <Link
              href={`/practice/${paper.setId}`}
              className="group flex h-full flex-col overflow-hidden rounded-[10px] border border-rule bg-surface transition-colors hover:border-rule-strong"
            >
              <p className="truncate px-4 pt-3 pb-2.5 text-meta text-ink">{paper.subject}</p>
              <div className={`relative flex h-[132px] items-center justify-center ${GROUNDS[i % GROUNDS.length]}`}>
                {/* A miniature paper: the subject's art and a few ruled lines. */}
                <div className="flex w-[74%] items-center gap-3 rounded-[8px] bg-surface p-3 shadow-[0_8px_18px_-10px_rgba(12,10,9,.35)] transition-transform duration-200 group-hover:-translate-y-0.5">
                  {paper.art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={paper.art} alt="" className="h-11 w-11 shrink-0 object-contain" />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-ui text-accent">
                      {paper.subject.charAt(0)}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="h-1.5 w-full rounded-full bg-surface-3" />
                    <span className="h-1.5 w-3/4 rounded-full bg-surface-3" />
                    <span className="mt-0.5 w-fit rounded-full bg-accent-soft px-2 py-0.5 text-[10px] leading-none text-accent">
                      {paper.exam}
                    </span>
                  </span>
                </div>
              </div>
              <div className="flex flex-1 items-center justify-between gap-2 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-meta font-light text-ink-muted">
                    {paper.session} · Set {paper.setCode}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-meta text-accent">
                  Start
                  <ArrowRight size={14} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
