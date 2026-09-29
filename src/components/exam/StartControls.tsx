'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'
import { useSignIn } from '@/components/site/AuthDialog'

/**
 * The declaration and the way in. As in the real exam, starting needs a
 * deliberate tick: the clock begins the moment the paper opens, and that
 * should never be an accident.
 *
 * `stacked` lays it out for a narrow column: the buttons full width, one above
 * the other, the way in first.
 *
 * `compact` is for the fixed mobile bar (see MobileStartBar): the checkbox
 * label shrinks to caption size and "View learning mode" becomes a plain
 * text link instead of a second button, so the bar stays short enough that
 * the questions behind it are not all hidden.
 *
 * The timed exam is for signed-in students — the attempt is saved and marked —
 * so for a visitor the way in is a Google sign-in that comes back to the paper.
 */
export function StartControls({
  setId,
  note,
  isSignedIn,
  stacked = false,
  compact = false,
}: {
  setId: string
  note?: ReactNode
  isSignedIn: boolean
  stacked?: boolean
  compact?: boolean
}) {
  const [ready, setReady] = useState(false)
  const { openSignIn } = useSignIn()

  const start = ready && !isSignedIn ? (
    <button
      type="button"
      onClick={() => openSignIn(`/practice/${setId}`)}
      className={buttonClass('primary', 'lg', stacked ? 'w-full' : 'w-full sm:w-auto')}
    >
      Sign in to begin
      <ArrowRight size={16} aria-hidden="true" />
    </button>
  ) : ready ? (
    <Link href={`/practice/${setId}`} className={buttonClass('primary', 'lg', stacked ? 'w-full' : 'w-full sm:w-auto')}>
      I am ready to begin
      <ArrowRight size={16} aria-hidden="true" />
    </Link>
  ) : (
    <button type="button" disabled className={buttonClass('primary', 'lg', stacked ? 'w-full' : 'w-full sm:w-auto')}>
      I am ready to begin
      <ArrowRight size={16} aria-hidden="true" />
    </button>
  )
  const learning = compact ? (
    <Link href={`/practice/${setId}?mode=learning`} className="self-start pl-[1.75rem] text-ui text-ink-muted underline underline-offset-2">
      View learning mode
    </Link>
  ) : (
    <Link
      href={`/practice/${setId}?mode=learning`}
      className={buttonClass('outline', 'lg', stacked ? 'w-full' : 'w-full sm:w-auto')}
    >
      View learning mode
    </Link>
  )

  return (
    <div className={`flex flex-col ${compact ? 'gap-2.5' : 'gap-4'}`}>
      <label className={`flex cursor-pointer items-start gap-2.5 text-ink ${compact ? 'text-micro' : 'text-ui gap-3'}`}>
        <input
          type="checkbox"
          checked={ready}
          onChange={(event) => setReady(event.target.checked)}
          className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 accent-ink"
        />
        I have read and understood the instructions, and I am ready to begin.
      </label>
      {note ? <p className="-mt-1 pl-[1.875rem] text-meta text-ink-muted">{note}</p> : null}

      {compact ? (
        <div className="flex flex-col gap-2.5">
          {learning}
          {start}
        </div>
      ) : stacked ? (
        <div className="flex flex-col gap-2">
          {start}
          {learning}
        </div>
      ) : (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {learning}
          {start}
        </div>
      )}
    </div>
  )
}
