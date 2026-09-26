'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { HIDDEN_COOKIE, type Spotlight, type SpotlightAction, type SpotlightTone } from '@/lib/spotlight-shared'
import { SignInButton } from '@/components/site/AuthDialog'
import { buttonClass } from '@/components/ui/primitives'
import { ArrowRight, CaretLeft, CaretRight, ClockCountdown, Info, Sparkle, Target, X } from '@/components/ui/icons'

/** Long enough to read a banner through before it moves on. */
const INTERVAL_MS = 8000
const SWIPE_PX = 48

/** Deep bands, one hue each, so the kind of banner reads before its words do. */
const TONES: Record<SpotlightTone, { band: string; Icon: typeof Info }> = {
  exam: { band: 'bg-linear-to-br from-[#9a3412] to-[#6b210a]', Icon: ClockCountdown },
  release: { band: 'bg-linear-to-br from-[#1e40af] to-[#172554]', Icon: Sparkle },
  feature: { band: 'bg-linear-to-br from-[#5b21b6] to-[#2e1065]', Icon: Target },
  announcement: { band: 'bg-linear-to-br from-[#047857] to-[#053d2e]', Icon: Info },
}

/** Remembers a closed banner for a year, in a cookie the server reads. */
function rememberHidden(id: string) {
  const current = document.cookie.match(new RegExp(`(?:^|; )${HIDDEN_COOKIE}=([^;]*)`))?.[1] ?? ''
  const ids = [...new Set([...current.split('.').filter(Boolean), id])].slice(-30)
  document.cookie = `${HIDDEN_COOKIE}=${ids.join('.')}; path=/; max-age=31536000; samesite=lax`
}

/**
 * The banners at the top of a page, one at a time. Moves on by itself unless
 * the reader is pointing at it, focused inside it, or prefers less motion;
 * arrows, dots and a swipe move it by hand; each banner can be closed.
 */
export function SpotlightCarousel({ items }: { items: Spotlight[] }) {
  const [hidden, setHidden] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [still, setStill] = useState(false)
  const swipeFrom = useRef<number | null>(null)

  const shown = items.filter((item) => !hidden.includes(item.id))
  const count = shown.length
  const active = Math.min(index, Math.max(0, count - 1))
  const paused = hovered || focused || still

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setStill(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (paused || count < 2) return
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [paused, count])

  if (count === 0) return null
  const current = shown[active]
  const go = (next: number) => setIndex((next + count) % count)

  const close = () => {
    rememberHidden(current.id)
    setHidden((ids) => [...ids, current.id])
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Highlights"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      }}
      className="group relative overflow-hidden rounded-[12px] text-white"
    >
      <div
        aria-live={paused ? 'polite' : 'off'}
        className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(-${active * 100}%)` }}
        onPointerDown={(event) => {
          if (event.pointerType !== 'mouse') swipeFrom.current = event.clientX
        }}
        onPointerUp={(event) => {
          if (swipeFrom.current === null) return
          const dx = event.clientX - swipeFrom.current
          swipeFrom.current = null
          if (Math.abs(dx) > SWIPE_PX) go(active + (dx < 0 ? 1 : -1))
        }}
      >
        {shown.map((item, i) => (
          <Slide key={item.id} item={item} position={`${i + 1} of ${count}`} current={i === active} />
        ))}
      </div>

      <button
        type="button"
        onClick={close}
        aria-label="Close this banner"
        className="absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X size={16} aria-hidden="true" />
      </button>

      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={() => go(active - 1)}
            aria-label="Previous banner"
            className="absolute top-1/2 left-2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 sm:flex"
          >
            <CaretLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => go(active + 1)}
            aria-label="Next banner"
            className="absolute top-1/2 right-2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 sm:flex"
          >
            <CaretRight size={16} aria-hidden="true" />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {shown.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show banner ${i + 1}`}
                aria-current={i === active}
                className="flex h-4 items-center"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all duration-300 ${
                    i === active ? 'w-5 bg-white' : 'w-1.5 bg-white/35 hover:bg-white/60'
                  }`}
                />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  )
}

function Slide({ item, position, current }: { item: Spotlight; position: string; current: boolean }) {
  const tone = TONES[item.tone]
  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={position}
      inert={!current}
      className={`grid w-full shrink-0 gap-8 px-5 pt-6 pb-10 sm:min-h-[15rem] sm:grid-cols-[minmax(0,1fr)_auto] sm:px-12 sm:py-0 ${tone.band}`}
    >
      <div className="min-w-0 self-center pr-8 sm:py-9 sm:pr-0">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[0.75rem] text-white ring-1 ring-white/20">
          <tone.Icon size={14} weight="duotone" aria-hidden="true" />
          {item.eyebrow}
        </span>
        <h2 className="mt-3 text-[1.5rem] leading-tight font-normal text-balance sm:text-[2rem]">{item.title}</h2>
        {item.body ? <p className="mt-2 max-w-[48ch] text-ui font-light text-white/75">{item.body}</p> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <Action action={item.cta} primary />
          {item.secondary ? <Action action={item.secondary} /> : null}
        </div>
      </div>
      {item.screens ? <Devices {...item.screens} /> : null}
    </div>
  )
}

/**
 * The site itself on a laptop, with a phone in front: real screens, framed.
 * Sits on the bottom edge of the band; only on screens wide enough for both.
 */
function Devices({ desktop, mobile }: { desktop: string; mobile: string }) {
  return (
    <div aria-hidden="true" className="hidden items-end self-end pr-10 pb-5 lg:flex">
      <div className="w-[19rem]">
        <div className="rounded-t-[10px] bg-[#0d0d12] p-[6px] pb-[7px] ring-1 ring-white/15">
          <Image
            src={desktop}
            alt=""
            width={960}
            height={600}
            sizes="296px"
            loading="eager"
            className="block aspect-[16/10] w-full rounded-[3px] object-cover object-top"
          />
        </div>
        <div className="relative -mx-[7%] h-[9px] rounded-b-[10px] bg-linear-to-b from-[#d9d9de] to-[#9d9da6]">
          <span className="absolute top-0 left-1/2 h-[4px] w-14 -translate-x-1/2 rounded-b-[4px] bg-[#8a8a93]" />
        </div>
      </div>
      <div className="relative z-10 -mb-2 -ml-12 w-[5.75rem] rounded-[18px] bg-[#0d0d12] p-[5px] ring-1 ring-white/20">
        <span className="absolute top-[9px] left-1/2 z-10 h-[5px] w-7 -translate-x-1/2 rounded-full bg-[#0d0d12]" />
        <Image
          src={mobile}
          alt=""
          width={360}
          height={779}
          sizes="84px"
          loading="eager"
          className="block aspect-[360/779] w-full rounded-[13px] object-cover object-top"
        />
      </div>
    </div>
  )
}

function Action({ action, primary = false }: { action: SpotlightAction; primary?: boolean }) {
  const className = buttonClass(primary ? 'inverse' : 'inverseOutline', 'md')
  const content = (
    <>
      {action.label}
      {primary ? <ArrowRight size={16} aria-hidden="true" /> : null}
    </>
  )
  if (action.signIn) {
    return (
      <SignInButton next={action.href} className={className}>
        {content}
      </SignInButton>
    )
  }
  return (
    <Link href={action.href} className={className}>
      {content}
    </Link>
  )
}
