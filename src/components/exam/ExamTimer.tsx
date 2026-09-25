'use client'

import { useEffect, useState, type RefObject } from 'react'
import { Pause, Play } from '@/components/ui/icons'

interface Clock {
  started: number
  now: number
  /** Milliseconds spent paused, over all pauses so far. */
  pausedFor: number
  /** When the current pause began, or null while running. */
  pausedAt: number | null
}

/**
 * The clock in the runner's header.
 *
 * Counts down when the paper has a duration and up otherwise. Reaching zero
 * does not force a submit — losing work to a timer would be worse than
 * letting someone overrun a practice paper — so it carries on and shows the
 * overrun instead.
 *
 * Time is measured from timestamps, not by counting interval ticks: browsers
 * throttle intervals in a background tab, and a tick counter would quietly
 * lose minutes whenever the paper was not the active tab.
 */
export function ExamTimer({
  countdownFrom,
  frozen,
  elapsedRef,
}: {
  countdownFrom: number | null
  frozen: boolean
  /** Elapsed seconds, published through a ref so the paper is not
   *  re-rendered once a second. */
  elapsedRef?: RefObject<number>
}) {
  const [clock, setClock] = useState<Clock>(() => {
    const at = Date.now()
    return { started: at, now: at, pausedFor: 0, pausedAt: null }
  })

  const paused = clock.pausedAt !== null
  const running = !paused && !frozen

  useEffect(() => {
    if (!running) return
    const interval = setInterval(() => setClock((c) => ({ ...c, now: Date.now() })), 1000)
    return () => clearInterval(interval)
  }, [running])

  function togglePause() {
    setClock((c) => {
      const at = Date.now()
      return c.pausedAt === null
        ? { ...c, now: at, pausedAt: at }
        : { ...c, now: at, pausedAt: null, pausedFor: c.pausedFor + (at - c.pausedAt) }
    })
  }

  const seconds = Math.max(
    0,
    Math.floor(((clock.pausedAt ?? clock.now) - clock.started - clock.pausedFor) / 1000),
  )

  useEffect(() => {
    if (elapsedRef) elapsedRef.current = seconds
  }, [seconds, elapsedRef])

  const total = countdownFrom ? countdownFrom * 60 : null
  const left = total !== null ? total - seconds : null
  const overrun = left !== null && left < 0
  // The last tenth of the paper, or the last five minutes, whichever is longer.
  const low = total !== null && left !== null && left <= Math.max(300, total * 0.1)

  return (
    <div className="flex items-center gap-2">
      <div className="text-right">
        <p className={`label ${low ? '!text-time-low' : ''}`}>
          {total === null ? 'Elapsed' : overrun ? 'Over time' : 'Time left'}
        </p>
        <p
          role="timer"
          aria-live="off"
          className={`text-[1.25rem] leading-tight  tabular-nums sm:text-[1.375rem] ${
            low ? 'text-time-low' : 'text-ink'
          }`}
        >
          {overrun ? '+' : ''}
          {formatClock(left !== null ? Math.abs(left) : seconds)}
        </p>
      </div>
      <button
        type="button"
        onClick={togglePause}
        disabled={frozen}
        aria-label={paused ? 'Resume the clock' : 'Pause the clock'}
        title={paused ? 'Resume the clock' : 'Pause the clock'}
        className="flex h-10 w-10 items-center justify-center rounded-control border border-rule bg-surface text-ink transition-colors hover:border-rule-strong disabled:opacity-40"
      >
        {paused ? <Play size={15} weight="fill" /> : <Pause size={15} weight="fill" />}
      </button>
    </div>
  )
}

export function formatClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`
}
