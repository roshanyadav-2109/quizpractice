import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { teacherPageGate } from '@/lib/supabase/server'
import { getSubjectBySlug } from '@/lib/queries'
import {
  NotAssignedError,
  QUEUE_SORTS,
  canTeachSubject,
  countPapers,
  getMyClaims,
  getMyNeedingChanges,
  getQueue,
  getSetProgress,
  getSubjectPapers,
  isQueueSort,
  type PaperCount,
  type QueuePage,
  type QueueSort,
} from '@/lib/teach/queries'
import { ROUTES } from '@/lib/teach/contracts'
import { FilterSelect } from '@/components/site/FilterSelect'
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
import { ContinueButton } from '@/components/teach/ContinueButton'
import { CoverageBar } from '@/components/teach/CoverageBar'
import { EmptyState } from '@/components/ui/EmptyState'
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
  const [allowed, changes, claims, sets, queue] = await Promise.all([
    canTeachSubject(subject.id),
    getMyNeedingChanges(),
    getMyClaims(),
    getSetProgress(subject.id),
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


  if (!allowed || (filter !== 'changes' && !queue)) {
    return (
      <NotAssigned subjectName={subject.name} programName={program.name} />
    )
  }

  const changesHere = changes.filter((item) => item.place?.subjectId === subject.id)
  const inView = new Set(matching.map((p) => p.id))
  const changesShown = changesHere.filter(
    (item) => (!paper || item.place?.paperId === paper) && (!narrowed || (item.place && inView.has(item.place.paperId))),
  )

  // The subject's standing in papers, overall and exam by exam.
  const examProgress = [...new Map(sets.map((set) => [set.examSlug, set.examName])).entries()].map(([examSlug, examName]) => ({
    examSlug,
    examName,
    papers: countPapers(sets.filter((set) => set.examSlug === examSlug)),
  }))

  return (
    <>
      {/* The sidebar names the subject that is open; the heading is for screen readers and the tab. */}
      <h1 className="sr-only">
        {subject.name}, {level.name}, {program.name}
      </h1>

      <div className="grid gap-4 rounded-[12px] border border-rule bg-surface p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] lg:items-center">
        <CoverageBar papers={countPapers(sets)} />
        {examProgress.length > 1 ? <ExamProgressStrip exams={examProgress} slug={subject.slug} view={view} filter={filter} /> : null}
        <ContinueButton subjectId={subject.id} subjectSlug={subject.slug} label="Continue" size="md" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 px-3 text-micro font-medium tracking-[0.08em] text-ink-faint uppercase">Show</p>
          <QueueFilters slug={subject.slug} active={filter} view={view} changes={changesHere.length} />

          <p className="mt-6 mb-2 px-3 text-micro font-medium tracking-[0.08em] text-ink-faint uppercase">Filter</p>
          <div className="flex flex-col gap-2 [&_label]:w-full [&_select]:w-full">
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
          </div>

        </aside>

        <div className="min-w-0">
          {queue ? (
            <QueueResults
              queue={queue}
              filter={filter}
              slug={subject.slug}
              subjectName={subject.name}
              view={view}
              narrowed={narrowed || paper !== null}
              myClaims={claims.map((claim) => claim.groupKey)}
            />
          ) : changesShown.length > 0 ? (
            <ExplanationList items={changesShown} />
          ) : (
            <EmptyState art="all-clear" title="Nothing to fix" />
          )}
        </div>
      </div>
    </>
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
          title="Page not found"
          actions={
            <Link href={queueHref(slug, { ...view, filter })} className={buttonClass('primary', 'md')}>
              First page
            </Link>
          }
        />
      )
    }
    if (filter === 'todo') {
      return (
        <EmptyState
          art="all-clear"
          title="All caught up"
          actions={
            <Link href={queueHref(slug, { ...view, filter: 'no_video' })} className={buttonClass('outline', 'md')}>
              Add videos
            </Link>
          }
        />
      )
    }
    return (
      <EmptyState art="no-results" title={`Nothing in “${filterLabel(filter)}”`}>
        {narrowed ? 'Clear the filters.' : null}
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
 * papers are done. A card narrows the queue
 * to that exam; the chosen one is outlined, and choosing it again clears it.
 */
function ExamProgressStrip({
  exams,
  slug,
  view,
  filter,
}: {
  exams: { examSlug: string; examName: string; papers: PaperCount }[]
  slug: string
  view: Omit<QueueView, 'filter' | 'page'>
  filter: DeskFilter
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-3">
      {exams.map((row) => {
        const active = view.exam === row.examSlug
        const share = row.papers.total ? Math.round((row.papers.done / row.papers.total) * 100) : 0
        return (
          <li key={row.examSlug}>
            <Link
              href={queueHref(slug, { filter, sort: view.sort, exam: active ? null : row.examSlug })}
              aria-current={active ? 'true' : undefined}
              className={`block rounded-[10px] border px-3.5 py-2.5 transition-colors ${
                active ? 'border-desk bg-desk-soft' : 'border-rule bg-surface-2/60 hover:border-rule-strong'
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-ui text-ink">{row.examName}</span>
                <span className="text-meta text-ink-faint tabular-nums">{share}%</span>
              </span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                <span className="block h-full rounded-full bg-desk" style={{ width: `${share}%` }} />
              </span>
              <span className="mt-2 block text-meta font-light text-ink-muted tabular-nums">
                {formatCount(row.papers.done)} of {formatCount(row.papers.total)} papers done
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
