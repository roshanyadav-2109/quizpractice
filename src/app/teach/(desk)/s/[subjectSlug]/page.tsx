import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { teacherPageGate } from '@/lib/supabase/server'
import { getSubjectBySlug } from '@/lib/queries'
import {
  NotAssignedError,
  canTeachSubject,
  getMyClaims,
  getMyNeedingChanges,
  getQueue,
  getSubjectPapers,
  type QueuePage,
} from '@/lib/teach/queries'
import { ROUTES } from '@/lib/teach/contracts'
import { Breadcrumb, SHELL, TitleCard } from '@/components/site/Page'
import { FilterRow } from '@/components/site/FilterSelect'
import {
  DEFAULT_FILTER,
  QueueFilters,
  filterLabel,
  isDeskFilter,
  queueHref,
  type DeskFilter,
} from '@/components/teach/QueueFilters'
import { PaperFilter } from '@/components/teach/PaperFilter'
import { ExplanationList, QueueList } from '@/components/teach/QueueList'
import { Pager } from '@/components/teach/Pager'
import { EmptyState } from '@/components/ui/EmptyState'
import { Stack } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'
import { formatCount } from '@/lib/format'

type Params = Promise<{ subjectSlug: string }>
type SearchParams = Promise<{ filter?: string | string[]; paper?: string | string[]; page?: string | string[] }>

/** Pages past this are not a queue anyone is reading; the biggest subject has about 85. */
const MAX_PAGE = 1000

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { subjectSlug } = await params
  const context = await getSubjectBySlug(subjectSlug)
  return { title: context ? context.subject.name : 'Subject' }
}

/**
 * One subject's queue: every question to explain, one row per duplicate
 * group, 50 to a page, filtered by state and optionally by paper. A subject
 * outside the teacher's combos gets the 403 view — the database refuses the
 * queue anyway, this only says so plainly.
 */
export default async function TeachSubjectPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const [{ subjectSlug }, query] = await Promise.all([params, searchParams])
  await teacherPageGate(ROUTES.teachSubject(subjectSlug))

  const context = await getSubjectBySlug(subjectSlug)
  if (!context) notFound()
  const { subject, level, program } = context

  const rawFilter = one(query.filter)
  const filter: DeskFilter = isDeskFilter(rawFilter) ? rawFilter : DEFAULT_FILTER
  const pageNumber = Math.min(Math.max(Number.parseInt(one(query.page) ?? '1', 10) || 1, 1), MAX_PAGE)

  // The papers come from the shared catalogue cache, so asking first costs
  // nothing — and only a paper of this subject is used; anything else is
  // ignored rather than refused.
  const papers = await getSubjectPapers(subject.id)
  const rawPaper = one(query.paper)
  const paper = papers.find((option) => option.id === rawPaper)?.id ?? null

  // The rest at once. The queue is refused outside the teacher's combos, so
  // its refusal is caught here and the gate below decides what to show.
  const [allowed, changes, claims, queue] = await Promise.all([
    canTeachSubject(subject.id),
    getMyNeedingChanges(),
    getMyClaims(),
    filter === 'changes'
      ? Promise.resolve(null)
      : getQueue(subject.id, filter, paper, pageNumber).catch((error: unknown) => {
          if (error instanceof NotAssignedError) return null
          throw error
        }),
  ])

  const crumbs = [
    { label: 'Teaching', href: ROUTES.teachHome },
    { label: program.short_name ?? program.name },
    { label: level.name },
    { label: subject.name },
  ]

  if (!allowed || (filter !== 'changes' && !queue)) {
    return (
      <div className={`${SHELL} py-6`}>
        <Breadcrumb crumbs={crumbs} />
        <NotAssigned subjectName={subject.name} programName={program.name} />
      </div>
    )
  }

  const changesHere = changes.filter((item) => item.place?.subjectId === subject.id)
  const changesShown = paper ? changesHere.filter((item) => item.place?.paperId === paper) : changesHere

  return (
    <div className={`${SHELL} py-6`}>
      <Breadcrumb crumbs={crumbs} />
      <TitleCard
        back={ROUTES.teachHome}
        title={subject.name}
        subtitle={`${program.name} · ${level.name}`}
        aside={
          <Link href={ROUTES.teachHelp} className={buttonClass('ghost', 'sm')}>
            Recording help
          </Link>
        }
      />

      <div className="mt-5">
        <QueueFilters slug={subject.slug} active={filter} paper={paper} changes={changesHere.length} />
      </div>
      <FilterRow>
        <PaperFilter papers={papers} value={paper} />
      </FilterRow>

      {queue ? (
        <>
          <p className="mt-4 flex items-start gap-2 text-meta text-ink-muted">
            <Stack size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-faint" />
            Duplicates are shown once; an explanation reaches every copy.
          </p>
          <div className="mt-4">
            <QueueResults
              queue={queue}
              filter={filter}
              slug={subject.slug}
              subjectName={subject.name}
              paper={paper}
              myClaims={claims.map((claim) => claim.groupKey)}
            />
          </div>
        </>
      ) : (
        <div className="mt-5">
          {changesShown.length > 0 ? (
            <ExplanationList items={changesShown} />
          ) : (
            <EmptyState art="all-clear" title="Nothing sent back">
              When a reviewer asks for changes to one of your explanations here, it is listed with their note.
            </EmptyState>
          )}
        </div>
      )}
    </div>
  )
}

function QueueResults({
  queue,
  filter,
  slug,
  subjectName,
  paper,
  myClaims,
}: {
  queue: QueuePage
  filter: DeskFilter
  slug: string
  subjectName: string
  paper: string | null
  myClaims: string[]
}) {
  if (queue.rows.length === 0) {
    // Past the last page: a stale link, or the queue shrank while paging.
    if (queue.page > 1) {
      return (
        <EmptyState
          art="no-results"
          title={`There is no page ${formatCount(queue.page)}`}
          actions={
            <Link href={queueHref(slug, { filter, paper })} className={buttonClass('primary', 'md')}>
              Back to the first page
            </Link>
          }
        >
          The queue is shorter than that now.
        </EmptyState>
      )
    }
    if (filter === 'todo') {
      return (
        <EmptyState
          art="all-clear"
          title={paper ? 'Every question in this paper has been started' : 'Every question here has been started'}
          actions={
            <Link href={queueHref(slug, { filter: 'no_video', paper })} className={buttonClass('outline', 'md')}>
              See what still needs a video
            </Link>
          }
        >
          Some may still be drafts or waiting for review. Nothing is left that no one has begun.
        </EmptyState>
      )
    }
    return (
      <EmptyState art="no-results" title={`Nothing under “${filterLabel(filter)}”`}>
        {paper ? 'Try all papers, or another filter.' : 'Try another filter.'}
      </EmptyState>
    )
  }

  const keep: Record<string, string> = {}
  if (filter !== DEFAULT_FILTER) keep.filter = filter
  if (paper) keep.paper = paper

  return (
    <>
      <QueueList rows={queue.rows} myClaims={myClaims} subjectName={subjectName} />
      <Pager
        page={queue.page}
        total={queue.total}
        pageSize={queue.pageSize}
        href={(page) => queueHref(slug, { filter, paper, page })}
        action={ROUTES.teachSubject(slug)}
        keep={keep}
      />
    </>
  )
}

/**
 * The 403 view: a signed-in teacher asking for a subject that is not theirs.
 * A plain page rather than forbidden(), so it needs no experimental switch
 * and says exactly what to do next.
 */
function NotAssigned({ subjectName, programName }: { subjectName: string; programName: string }) {
  return (
    <EmptyState
      className="mt-4"
      art="sign-in-required"
      size="lg"
      title="This subject is not one of yours"
      actions={
        <Link href={ROUTES.teachHome} className={buttonClass('primary', 'md')}>
          Back to your subjects
        </Link>
      }
    >
      You can explain questions only in the subjects an admin has assigned you.{' '}
      {`To work on ${subjectName} (${programName}), ask an admin to add it to your subjects.`}
    </EmptyState>
  )
}
