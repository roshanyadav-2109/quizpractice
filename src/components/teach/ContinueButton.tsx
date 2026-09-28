'use client'

import { useActionState } from 'react'
import { continueAction } from '@/app/teach/(desk)/actions'
import { ArrowRight } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'
import type { ActionState } from '@/app/admin/actions'

/**
 * The way back into work on a subject. The server picks the next thing when
 * it is pressed — a draft, an explanation sent back, a held question, else the
 * first untouched group — and opens the studio on it.
 */
export function ContinueButton({
  subjectId,
  subjectSlug,
  label = 'Continue',
  size = 'sm',
}: {
  subjectId: string
  subjectSlug: string
  label?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const [state, run, pending] = useActionState<ActionState, FormData>(continueAction.bind(null, subjectId, subjectSlug), {})
  return (
    <form action={run} className="flex flex-col items-end gap-1">
      <button type="submit" disabled={pending} className={buttonClass('primary', size)}>
        {pending ? 'Finding the next one…' : label}
        <ArrowRight size={size === 'lg' ? 16 : 14} aria-hidden="true" />
      </button>
      {state.error ? (
        <p role="alert" className="text-micro text-incorrect">
          {state.error}
        </p>
      ) : null}
    </form>
  )
}
