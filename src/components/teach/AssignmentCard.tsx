'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { continueAction } from '@/app/teach/(desk)/actions'
import { CoverageBar } from '@/components/teach/CoverageBar'
import { Trail } from '@/components/site/Page'
import { ArrowRight, Stack, Warning } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'
import { formatCount } from '@/lib/format'
import type { ActionState } from '@/app/admin/actions'
import type { AssignmentSummary } from '@/lib/teach/contracts'

/**
 * One branch + subject combo on the desk: where it sits, how big it is once
 * duplicates are folded together, how far it has got, and the way in.
 *
 * "Continue" asks the server for the next thing to do when it is clicked —
 * a draft, an explanation sent back, a held question, else the first
 * untouched group — and opens the studio on it.
 *
 * A combo whose subject has since moved to another branch grants nothing,
 * so it shows a warning and no way in.
 */
export function AssignmentCard({
  summary,
  queueHref,
  changesHref,
  needsChanges,
}: {
  summary: AssignmentSummary
  queueHref: string
  changesHref: string
  /** The teacher's explanations here that a reviewer sent back. */
  needsChanges: number
}) {
  const [state, run, pending] = useActionState<ActionState, FormData>(
    continueAction.bind(null, summary.subjectId, summary.subjectSlug),
    {},
  )

  const saved = Math.max(summary.questions - summary.groups, 0)

  return (
    <article className="flex h-full flex-col rounded-card border border-rule bg-surface p-4">
      <p className="text-micro text-ink-faint">
        <Trail parts={[summary.programName, summary.levelName]} />
      </p>
      <h3 className="mt-0.5 text-card text-ink">{summary.subjectName}</h3>

      {summary.valid ? (
        <>
          <p className="mt-1 text-meta text-ink-muted tabular-nums">
            {formatCount(summary.questions)} {summary.questions === 1 ? 'question' : 'questions'}
            {saved > 0 ? (
              <>
                {' · '}
                {formatCount(summary.groups)} to explain
              </>
            ) : null}
          </p>
          {saved > 0 ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-micro text-ink-faint tabular-nums">
              <Stack size={14} aria-hidden="true" />
              {formatCount(saved)} saved by duplicates: one explanation covers every copy
            </p>
          ) : null}

          <CoverageBar
            className="mt-3"
            groups={summary.groups}
            explained={summary.explained}
            withVideo={summary.withVideo}
            inReview={summary.inReview}
          />

          {needsChanges > 0 ? (
            <Link
              href={changesHref}
              className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-md bg-incorrect-soft px-2 py-0.5 text-micro text-incorrect transition-colors hover:underline"
            >
              {formatCount(needsChanges)} {needsChanges === 1 ? 'explanation needs' : 'explanations need'} changes
            </Link>
          ) : null}

          <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-4">
            <Link href={queueHref} className={buttonClass('outline', 'sm')}>
              Open queue
            </Link>
            <form action={run}>
              <button type="submit" disabled={pending} className={buttonClass('primary', 'sm')}>
                {pending ? 'Finding the next one…' : 'Continue'}
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </form>
          </div>
          {state.error ? (
            <p role="alert" className="mt-2 text-right text-micro text-incorrect">
              {state.error}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 flex gap-2 rounded-control bg-marked-soft px-3 py-2 text-meta text-marked">
          <Warning size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            {summary.subjectName} is no longer part of {summary.programName}, so this assignment gives no access. Ask an
            admin to assign it again under the right branch.
          </span>
        </p>
      )}
    </article>
  )
}
