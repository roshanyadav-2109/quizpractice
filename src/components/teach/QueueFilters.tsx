import Link from 'next/link'
import { ROUTES, QUEUE_FILTERS, QUEUE_FILTER_LABELS, isQueueFilter, type QueueFilter } from '@/lib/teach/contracts'

/**
 * What the queue can show. The six from teacher_queue work on groups — To do
 * (nothing started), Needs video, In review, Published, Mine, All — and one
 * more is the teacher's own: Needs changes, the explanations a reviewer sent
 * back to them.
 */
export type DeskFilter = QueueFilter | 'changes'

export const DEFAULT_FILTER: DeskFilter = 'todo'

export function isDeskFilter(value: unknown): value is DeskFilter {
  return value === 'changes' || isQueueFilter(value)
}

const ORDER: DeskFilter[] = [
  'todo',
  'no_video',
  'changes',
  ...QUEUE_FILTERS.filter((f) => f !== 'todo' && f !== 'no_video'),
]

const LABELS: Record<DeskFilter, string> = { ...QUEUE_FILTER_LABELS, changes: 'Needs changes' }

/** Everything that shapes the queue besides the subject. */
export interface QueueView {
  filter?: DeskFilter
  paper?: string | null
  /** Exam type slug, e.g. quiz-1. */
  exam?: string | null
  year?: string | null
  /** jan | may | sep */
  term?: string | null
  sort?: string | null
  page?: number
}

/** The queue's address with its filters, order and page; defaults are left out. */
export function queueHref(
  slug: string,
  { filter = DEFAULT_FILTER, paper = null, exam = null, year = null, term = null, sort = null, page = 1 }: QueueView = {},
): string {
  const query = new URLSearchParams()
  if (filter !== DEFAULT_FILTER) query.set('filter', filter)
  if (exam) query.set('exam', exam)
  if (year) query.set('year', year)
  if (term) query.set('term', term)
  if (paper) query.set('paper', paper)
  if (sort && sort !== 'newest') query.set('sort', sort)
  if (page > 1) query.set('page', String(page))
  const suffix = query.toString()
  return suffix ? `${ROUTES.teachSubject(slug)}?${suffix}` : ROUTES.teachSubject(slug)
}

/** The filters, as a list down the side. Changing the filter keeps the exam, term, paper and order, and goes back to page one. */
export function QueueFilters({
  slug,
  active,
  view,
  changes,
}: {
  slug: string
  active: DeskFilter
  /** The rest of the queue's view, kept when the filter changes. */
  view: Omit<QueueView, 'filter' | 'page'>
  /** How many of the teacher's explanations here need changes. */
  changes: number
}) {
  return (
    <nav aria-label="Show" className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-visible">
      {ORDER.map((filter) => {
        const on = filter === active
        return (
          <Link
            key={filter}
            href={queueHref(slug, { ...view, filter })}
            aria-current={on ? 'page' : undefined}
            className={`flex shrink-0 items-center justify-between gap-3 rounded-control px-3 py-2 text-ui transition-colors ${
              on ? 'bg-ink text-white' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
            }`}
          >
            {LABELS[filter]}
            {filter === 'changes' && changes > 0 ? (
              <span
                className={`rounded-full px-1.5 text-micro tabular-nums ${on ? 'bg-white/20 text-white' : 'bg-incorrect-soft text-incorrect'}`}
              >
                {changes}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}

export function filterLabel(filter: DeskFilter): string {
  return LABELS[filter]
}
