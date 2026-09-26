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

const TONES: Record<SpotlightTone, { slide: string; border: string; chip: string; glow: string; Icon: typeof Info }> = {
  exam: {
    slide: 'bg-linear-to-r from-[#fff4e6] via-[#fffaf3] to-surface',
    border: 'border-[#f3d4a8]',
    chip: 'text-marked ring-[#f3d4a8]',
    glow: 'bg-[#ffe6c4]',
    Icon: ClockCountdown,
  },
  release: {
    slide: 'bg-linear-to-r from-accent-soft via-[#f7f9ff] to-surface',
    border: 'border-[#cbd9fb]',
    chip: 'text-accent ring-[#cbd9fb]',
    glow: 'bg-[#dbe6ff]',
    Icon: Sparkle,
  },
  feature: {
    slide: 'bg-linear-to-r from-review-soft via-[#fbf9ff] to-surface',
    border: 'border-[#ddd3fa]',
    chip: 'text-review ring-[#ddd3fa]',
    glow: 'bg-[#ebe4ff]',
    Icon: Target,
  },
  announcement: {
    slide: 'bg-linear-to-r from-correct-soft via-[#f7fcf9] to-surface',
    border: 'border-[#c9e9d5]',
    chip: 'text-correct ring-[#c9e9d5]',
    glow: 'bg-[#d9f2e3]',
    Icon: Info,
  },
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
      className={`group relative overflow-hidden rounded-[12px] border transition-colors duration-500 ${TONES[current.tone].border}`}
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
        className="absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-surface hover:text-ink"
      >
        <X size={16} aria-hidden="true" />
      </button>

      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={() => go(active - 1)}
            aria-label="Previous banner"
            className="absolute top-1/2 left-2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-rule bg-surface/90 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 sm:flex"
          >
            <CaretLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => go(active + 1)}
            aria-label="Next banner"
            className="absolute top-1/2 right-2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-rule bg-surface/90 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 sm:flex"
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
                    i === active ? 'w-5 bg-ink/70' : 'w-1.5 bg-ink/20 hover:bg-ink/40'
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
      className={`grid w-full shrink-0 items-center gap-6 px-5 pt-6 pb-9 sm:min-h-[13.5rem] sm:grid-cols-[minmax(0,1fr)_auto] sm:px-12 sm:py-7 ${tone.slide}`}
    >
      <div className="min-w-0 pr-8 sm:pr-0">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[0.75rem] ring-1 ${tone.chip}`}
        >
          <tone.Icon size={14} weight="duotone" aria-hidden="true" />
          {item.eyebrow}
        </span>
        <h2 className="mt-3 text-[1.375rem] leading-tight font-normal text-balance text-ink sm:text-[1.75rem]">
          {item.title}
        </h2>
        {item.body ? (
          <p className="mt-2 max-w-[60ch] text-ui leading-relaxed font-light text-ink-muted">{item.body}</p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <Action action={item.cta} primary />
          {item.secondary ? <Action action={item.secondary} /> : null}
        </div>
      </div>
      <Visual item={item} glow={tone.glow} />
    </div>
  )
}

function Action({ action, primary = false }: { action: SpotlightAction; primary?: boolean }) {
  const className = buttonClass(primary ? 'primary' : 'outline', 'md')
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

/** The right-hand side: a countdown, a fan of subject icons, or an illustration. */
function Visual({ item, glow }: { item: Spotlight; glow: string }) {
  if (item.countdown) {
    const { days, date } = item.countdown
    return (
      <div className="hidden items-center gap-5 sm:flex">
        {item.art ? (
          <span className="relative flex h-28 w-28 items-center justify-center">
            <span aria-hidden="true" className={`absolute inset-2 rounded-full ${glow}`} />
            <Image src={item.art} alt="" width={96} height={96} loading="eager" className="relative" />
          </span>
        ) : null}
        <div className="w-36 rounded-[12px] border border-rule bg-surface px-4 py-4 text-center">
          <p className="text-[3rem] leading-none font-light text-ink tabular-nums">{days === 0 ? 'Today' : days}</p>
          <p className="mt-1.5 text-meta text-ink-muted">{days === 0 ? 'good luck' : days === 1 ? 'day to go' : 'days to go'}</p>
          <p className="mt-3 border-t border-rule pt-2.5 text-meta font-light text-ink-faint">{date}</p>
        </div>
      </div>
    )
  }

  if (item.stack && item.stack.length > 1) {
    const tilt = ['-rotate-3', 'rotate-2', '-rotate-2', 'rotate-3']
    const tile = 'relative flex h-20 w-20 items-center justify-center rounded-[14px] border border-rule bg-surface'
    return (
      <div aria-hidden="true" className="relative hidden h-40 items-center pr-2 sm:flex">
        <span className={`absolute inset-x-2 inset-y-7 rounded-full ${glow}`} />
        {item.stack.map((src, i) => (
          <span key={src} className={`${tile} ${tilt[i] ?? ''} ${i > 0 ? '-ml-3' : ''}`}>
            <Image src={src} alt="" width={52} height={52} loading="eager" />
          </span>
        ))}
        {item.stackMore ? (
          <span className={`${tile} -ml-3 rotate-2 text-ui text-ink-muted tabular-nums`}>+{item.stackMore}</span>
        ) : null}
      </div>
    )
  }

  if (!item.art) return null
  return (
    <span aria-hidden="true" className="relative hidden h-44 w-44 items-center justify-center sm:flex">
      <span className={`absolute inset-3 rounded-full ${glow}`} />
      <Image src={item.art} alt="" width={176} height={176} loading="eager" className="relative" />
    </span>
  )
}
