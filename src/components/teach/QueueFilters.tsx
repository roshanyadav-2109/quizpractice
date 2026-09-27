import { FilterBar } from '@/components/site/Page'
import { Chip } from '@/components/ui/primitives'
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

/** The filter chips. Changing the filter keeps the exam, term, paper and order, and goes back to page one. */
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
    <FilterBar label="Show">
      {ORDER.map((filter) => (
        <Chip key={filter} href={queueHref(slug, { ...view, filter })} active={filter === active}>
          {LABELS[filter]}
          {filter === 'changes' && changes > 0 ? <span className="ml-1.5 tabular-nums">{changes}</span> : null}
        </Chip>
      ))}
    </FilterBar>
  )
}

export function filterLabel(filter: DeskFilter): string {
  return LABELS[filter]
}
