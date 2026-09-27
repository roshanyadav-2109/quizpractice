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

/** The queue's address with its filter, paper and page; defaults are left out. */
export function queueHref(
  slug: string,
  {
    filter = DEFAULT_FILTER,
    paper = null,
    page = 1,
  }: { filter?: DeskFilter; paper?: string | null; page?: number } = {},
): string {
  const query = new URLSearchParams()
  if (filter !== DEFAULT_FILTER) query.set('filter', filter)
  if (paper) query.set('paper', paper)
  if (page > 1) query.set('page', String(page))
  const suffix = query.toString()
  return suffix ? `${ROUTES.teachSubject(slug)}?${suffix}` : ROUTES.teachSubject(slug)
}

/** The filter chips. Changing the filter keeps the paper and goes back to page one. */
export function QueueFilters({
  slug,
  active,
  paper,
  changes,
}: {
  slug: string
  active: DeskFilter
  paper: string | null
  /** How many of the teacher's explanations here need changes. */
  changes: number
}) {
  return (
    <FilterBar label="Show">
      {ORDER.map((filter) => (
        <Chip key={filter} href={queueHref(slug, { filter, paper })} active={filter === active}>
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
