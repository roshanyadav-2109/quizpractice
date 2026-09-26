import Link from 'next/link'
import { getMistakeBank } from '@/lib/queries'
import { buttonClass } from '@/components/ui/primitives'
import { ArrowCounterClockwise, ArrowRight } from '@/components/ui/icons'

const BATCH = 10

/**
 * Under the home page search, for a signed-in student with questions still
 * wrong: one click straight into retrying them, ten at a time.
 */
export async function MistakesCta() {
  const due = (await getMistakeBank()).filter((m) => m.state !== 'fixed').length
  if (due === 0) return null

  return (
    <Link
      href="/mistakes/practice"
      className="group mx-auto mt-5 flex max-w-2xl items-center gap-4 rounded-card border border-rule bg-surface px-4 py-3 text-left transition-colors hover:border-rule-strong"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-review-soft text-review">
        <ArrowCounterClockwise size={20} weight="duotone" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-ui text-ink">Start working on your mistakes</span>
        <span className="block text-meta font-light text-ink-faint tabular-nums">
          {due} {due === 1 ? 'question' : 'questions'} to get right · {Math.min(BATCH, due)} at a time
        </span>
      </span>
      <span className={buttonClass('primary', 'sm', 'shrink-0')}>
        Start
        <ArrowRight size={14} aria-hidden="true" />
      </span>
    </Link>
  )
}
