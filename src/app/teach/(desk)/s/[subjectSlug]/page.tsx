import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { teacherPageGate } from '@/lib/supabase/server'
import { getSubjectBySlug } from '@/lib/queries'
import {
  NotAssignedError,
  QUEUE_SORTS,
  canTeachSubject,
  getExamProgress,
  getMyClaims,
  getMyNeedingChanges,
  getQueue,
  getSubjectPapers,
  isQueueSort,
  type ExamProgress,
  type QueuePage,
  type QueueSort,
} from '@/lib/teach/queries'
import { ROUTES } from '@/lib/teach/contracts'
import { Breadcrumb, SHELL, TitleCard } from '@/components/site/Page'
import { FilterRow, FilterSelect } from '@/components/site/FilterSelect'
import { seasonName, yearTermFilter } from '@/lib/terms'
import {
  DEFAULT_FILTER,
  QueueFilters,
  filterLabel,
  isDeskFilter,
  queueHref,
  type DeskFilter,
  type QueueView,
} from '@/components/teach/QueueFilters'
import { PaperFilter } from '@/components/teach/PaperFilter'
import { ExplanationList, QueueList } from '@/components/teach/QueueList'
import { Pager } from '@/components/teach/Pager'
import { EmptyState } from '@/components/ui/EmptyState'
import { Stack } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'
import { formatCount } from '@/lib/format'

type Params = Promise<{ subjectSlug: string }>
type SearchParams = Promise<{
  filter?: string | string[]
  paper?: string | string[]
  exam?: string | string[]
  year?: string | string[]
  term?: string | string[]
  sort?: string | string[]
  page?: string | string[]
}>

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

  // Exam, then year and term within it, narrow the papers; the queue is then
  // asked for those papers only. The term rules live in src/lib/terms.ts.
  const exams = [...new Map(papers.map((p) => [p.examSlug, p])).values()].sort((a, b) => a.examOrder - b.examOrder)
  const exam = exams.find((option) => option.examSlug === one(query.exam)) ?? null
  const examPapers = exam ? papers.filter((p) => p.examSlug === exam.examSlug) : papers
  const terms = yearTermFilter(examPapers, { year: one(query.year), term: one(query.term) })
  const matching = examPapers.filter((p) => terms.matches(p.session_date))
  const narrowed = exam !== null || terms.year !== null || terms.season !== null
  const rawPaper = one(query.paper)
  const paper = matching.find((option) => option.id === rawPaper)?.id ?? null
  const rawSort = one(query.sort)
  const sort: QueueSort = isQueueSort(rawSort) ? rawSort : 'newest'
  const view: Omit<QueueView, 'filter' | 'page'> = {
    paper,
    exam: exam?.examSlug ?? null,
    year: terms.year !== null ? String(terms.year) : null,
    term: terms.season,
    sort,
  }

  // The rest at once. The queue is refused outside the teacher's combos, so
  // its refusal is caught here and the gate below decides what to show.
  const [allowed, changes, claims, progress, queue] = await Promise.all([
    canTeachSubject(subject.id),
    getMyNeedingChanges(),
    getMyClaims(),
    getExamProgress(subject.id),
    filter === 'changes'
      ? Promise.resolve(null)
      : getQueue(subject.id, filter, paper, pageNumber, {
          papers: narrowed ? matching.map((p) => p.id) : null,
          sort,
        }).catch((error: unknown) => {
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
  const inView = new Set(matching.map((p) => p.id))
  const changesShown = changesHere.filter(
    (item) => (!paper || item.place?.paperId === paper) && (!narrowed || (item.place && inView.has(item.place.paperId))),
  )

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

      {progress.length > 1 ? (
        <ExamProgressStrip progress={progress} slug={subject.slug} view={view} filter={filter} />
      ) : null}

      <div className="mt-5">
        <QueueFilters slug={subject.slug} active={filter} view={view} changes={changesHere.length} />
      </div>
      <FilterRow>
        {exams.length > 1 ? (
          <FilterSelect
            name="exam"
            label="Exam"
            allLabel="All exams"
            value={exam?.examSlug ?? null}
            options={exams.map((option) => ({ value: option.examSlug, label: option.examName }))}
            resets={['year', 'term', 'paper']}
          />
        ) : null}
        {terms.years.length > 1 ? (
          <FilterSelect
            name="year"
            label="Year"
            allLabel="All years"
            value={terms.year !== null ? String(terms.year) : null}
            options={terms.years.map((year) => ({ value: String(year), label: String(year) }))}
            resets={['term', 'paper']}
          />
        ) : null}
        {terms.seasons.length > 1 ? (
          <FilterSelect
            name="term"
            label="Term"
            allLabel="All terms"
            value={terms.season}
            options={terms.seasons.map((season) => ({ value: season, label: seasonName(season) }))}
            resets={['paper']}
          />
        ) : null}
        <PaperFilter papers={matching} value={paper} />
        <FilterSelect
          name="sort"
          label="Order"
          allLabel={QUEUE_SORTS[0].label}
          value={sort === 'newest' ? null : sort}
          options={QUEUE_SORTS.slice(1).map((option) => ({ value: option.value, label: option.label }))}
        />
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
              view={view}
              narrowed={narrowed || paper !== null}
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
  view,
  narrowed,
  myClaims,
}: {
  queue: QueuePage
  filter: DeskFilter
  slug: string
  subjectName: string
  view: Omit<QueueView, 'filter' | 'page'>
  /** An exam, term or paper is chosen. */
  narrowed: boolean
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
            <Link href={queueHref(slug, { ...view, filter })} className={buttonClass('primary', 'md')}>
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
          title={view.paper ? 'Every question in this paper has been started' : 'Every question here has been started'}
          actions={
            <Link href={queueHref(slug, { ...view, filter: 'no_video' })} className={buttonClass('outline', 'md')}>
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
        {narrowed ? 'Try all exams and papers, or another filter.' : 'Try another filter.'}
      </EmptyState>
    )
  }

  const keep: Record<string, string> = {}
  if (filter !== DEFAULT_FILTER) keep.filter = filter
  for (const key of ['exam', 'year', 'term', 'paper'] as const) {
    const value = view[key]
    if (value) keep[key] = value
  }
  if (view.sort && view.sort !== 'newest') keep.sort = view.sort

  return (
    <>
      <QueueList rows={queue.rows} myClaims={myClaims} subjectName={subjectName} />
      <Pager
        page={queue.page}
        total={queue.total}
        pageSize={queue.pageSize}
        href={(page) => queueHref(slug, { ...view, filter, page })}
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

/**
 * Progress per exam, as a strip of small cards: how many of each exam's
 * questions are explained and how many have video. A card narrows the queue
 * to that exam; the chosen one is outlined, and choosing it again clears it.
 */
function ExamProgressStrip({
  progress,
  slug,
  view,
  filter,
}: {
  progress: ExamProgress[]
  slug: string
  view: Omit<QueueView, 'filter' | 'page'>
  filter: DeskFilter
}) {
  return (
    <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {progress.map((row) => {
        const active = view.exam === row.examSlug
        const share = row.groups ? Math.round((row.explained / row.groups) * 100) : 0
        return (
          <li key={row.examSlug}>
            <Link
              href={queueHref(slug, { filter, sort: view.sort, exam: active ? null : row.examSlug })}
              aria-current={active ? 'true' : undefined}
              className={`block rounded-card border bg-surface px-4 py-3 transition-colors ${
                active ? 'border-ink' : 'border-rule hover:border-rule-strong'
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-ui text-ink">{row.examName}</span>
                <span className="text-meta text-ink-faint tabular-nums">{share}%</span>
              </span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
              </span>
              <span className="mt-2 block text-meta font-light text-ink-muted tabular-nums">
                {formatCount(row.explained)} of {formatCount(row.groups)} explained · {formatCount(row.withVideo)} with video
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
