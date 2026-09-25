'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'

/**
 * The declaration and the way in. As in the real exam, starting needs a
 * deliberate tick: the clock begins the moment the paper opens, and that
 * should never be an accident.
 *
 * `stacked` lays it out for a narrow column: the buttons full width, one above
 * the other, the way in first.
 */
export function StartControls({
  setId,
  note,
  stacked = false,
}: {
  setId: string
  note?: ReactNode
  stacked?: boolean
}) {
  const [ready, setReady] = useState(false)

  const start = ready ? (
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
  const learning = (
    <Link
      href={`/practice/${setId}?mode=learning`}
      className={buttonClass('outline', 'lg', stacked ? 'w-full' : 'w-full sm:w-auto')}
    >
      View learning mode
    </Link>
  )

  return (
    <div className="flex flex-col gap-4">
      <label className="flex cursor-pointer items-start gap-3 text-ui text-ink">
        <input
          type="checkbox"
          checked={ready}
          onChange={(event) => setReady(event.target.checked)}
          className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 accent-ink"
        />
        I have read and understood the instructions, and I am ready to begin.
      </label>
      {note ? <p className="-mt-1 pl-[1.875rem] text-meta text-ink-muted">{note}</p> : null}

      {stacked ? (
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
