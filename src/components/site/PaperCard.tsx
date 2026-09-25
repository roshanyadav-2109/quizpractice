import Link from 'next/link'
import { ArrowRight, Printer } from '@/components/ui/icons'
import { Badge, buttonClass } from '@/components/ui/primitives'

export interface PaperCardProps {
  setId: string
  /** The line that identifies this sitting in context. */
  title: string
  /** Small tags above the title: exam type, set code. */
  tags: string[]
  /** The sitting date, set in the top-right corner. */
  date: string
  /** Marks, duration, question count. */
  facts: string[]
  best: { attemptId: string; score: number; maxScore: number; percentage: number } | null
}

/**
 * One sitting as a row card: tags and date across the top, what it is, what
 * it costs you in time, how you did last time, and the way in.
 *
 * "Start paper" opens the paper's instructions rather than the runner — the
 * clock starts there, deliberately, not on a stray click here.
 */
export function PaperCard({ setId, title, tags, date, facts, best }: PaperCardProps) {
  return (
    <article className="flex h-full flex-col rounded-card border border-rule bg-surface p-4 transition-colors hover:border-rule-strong">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[1.0625rem] leading-snug text-ink">{title}</h3>
        <p className="shrink-0 text-meta text-ink-muted tabular-nums">{date}</p>
      </div>

      {tags.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      ) : null}
      <p className="mt-1 text-meta text-ink-faint tabular-nums">{facts.join(' · ')}</p>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-3">
        {best ? (
          <Link
            href={`/result/${best.attemptId}`}
            className="text-meta text-ink-muted tabular-nums transition-colors hover:text-ink"
          >
            Best <span className="text-ink">{best.score}/{best.maxScore}</span>
            <span className="text-ink-faint"> · {best.percentage}%</span>
          </Link>
        ) : (
          <p className="text-meta text-ink-faint">Not attempted</p>
        )}

        <div className="flex items-center gap-2">
          <Link
            href={`/print/${setId}`}
            title="Printable worksheet"
            aria-label={`Printable worksheet: ${title}`}
            className={buttonClass('outline', 'sm', 'w-9 !px-0')}
          >
            <Printer size={16} aria-hidden="true" />
          </Link>
          <Link href={`/paper/${setId}`} className={buttonClass('primary', 'sm')}>
            {best ? 'Re-attempt' : 'Start paper'}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  )
}
