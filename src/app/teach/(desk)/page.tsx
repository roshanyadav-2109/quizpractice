import Link from 'next/link'
import type { ReactNode } from 'react'
import { teacherPageGate } from '@/lib/supabase/server'
import { getBrowseTree, getPaperIndex } from '@/lib/queries'
import {
  NotAssignedError,
  countPapers,
  getSetProgress,
  getMyClaims,
  getMyNeedingChanges,
  getMyRecentExplanations,
  getMySummary,
  getQueue,
} from '@/lib/teach/queries'
import { ROUTES, type AssignmentSummary } from '@/lib/teach/contracts'
import { ContinueButton } from '@/components/teach/ContinueButton'
import { ExplanationList, QueueList } from '@/components/teach/QueueList'
import { queueHref } from '@/components/teach/QueueFilters'
import { ActivityCalendar, Gauge, Panel } from '@/components/dashboard/panels'
import { EmptyState } from '@/components/ui/EmptyState'
import { Art } from '@/components/ui/Art'
import { ArrowRight, CaretRight, CheckCircle, PencilSimpleLine, Warning } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'
import { artFor } from '@/lib/art'
import { formatCount, istDayKey } from '@/lib/format'

/** Questions shown under "Up next". */
const UP_NEXT = 6

/** The activity calendar in the desk's teal, lightest to darkest. */
const TEAL_RAMP = ['bg-surface-3', 'bg-[#b9ded7]', 'bg-[#7cc2b6]', 'bg-[#2f9a8a]', 'bg-desk']

type SearchParams = Promise<{ subject?: string | string[] }>

/** Morning, afternoon or evening, in India like every time on the site. */
function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(new Date()))
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

/**
 * The teacher's desk, laid out like the student dashboard: how many papers are
 * done and how many are left — overall, as a dial, and exam by exam — the days spent
 * teaching, then the work itself: the next questions waiting, and what is in
 * progress or was sent back. An admin, who may teach any subject, also gets
 * every subject in the catalogue as a way into its queue.
 */
export default async function TeachDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await teacherPageGate(ROUTES.teachHome)
  const admin = profile.role === 'admin'
  const asked = (await searchParams).subject

  const [summary, changes, mine, claims, tree, paperIndex] = await Promise.all([
    getMySummary(),
    getMyNeedingChanges(),
    getMyRecentExplanations(500),
    getMyClaims(),
    admin ? getBrowseTree() : Promise.resolve([]),
    admin ? getPaperIndex() : Promise.resolve([]),
  ])
  const valid = summary.filter((combo) => combo.valid)

  // The subject "Up next" draws from: the one asked for, else the one with the
  // most left to explain.
  const byRemaining = [...valid].sort((a, b) => b.groups - b.explained - (a.groups - a.explained))
  const current: AssignmentSummary | undefined =
    valid.find((combo) => combo.subjectSlug === (Array.isArray(asked) ? asked[0] : asked)) ?? byRemaining[0]

  const [queue, setsBySubject] = await Promise.all([
    current
      ? getQueue(current.subjectId, 'todo', null, 1).catch((error: unknown) => {
          if (error instanceof NotAssignedError) return null
          throw error
        })
      : Promise.resolve(null),
    Promise.all(valid.slice(0, 8).map(async (combo) => [combo.subjectId, await getSetProgress(combo.subjectId)] as const)).then(
      (entries) => new Map(entries),
    ),
  ])
  const upNext = queue?.rows.slice(0, UP_NEXT) ?? []

  const drafts = mine.filter((item) => item.state === 'draft')
  const inProgress = [...changes, ...drafts]
  const submitted = mine.filter((item) => item.state === 'review' || item.state === 'live').slice(0, 5)

  // A day counts when an explanation was saved or submitted on it.
  const days = new Map<string, number>()
  for (const item of mine) {
    const key = istDayKey(new Date(item.updatedAt))
    days.set(key, (days.get(key) ?? 0) + 1)
  }

  // Work counted in papers: a paper is done when every question in it is
  // explained. "12 papers done, 40 left" is a goal a teacher can see the end of.
  const sets = valid.flatMap((combo) => setsBySubject.get(combo.subjectId) ?? [])
  const totals = countPapers(sets)
  const percent = totals.total > 0 ? (totals.done / totals.total) * 100 : 0

  // Done and left, exam by exam for one subject; subject by subject for several.
  const breakdown =
    valid.length === 1
      ? [...new Map(sets.map((set) => [set.examSlug, set.examName])).entries()].map(([slug, name]) => ({
          key: slug,
          name,
          ...countPapers(sets.filter((set) => set.examSlug === slug)),
        }))
      : valid.map((combo) => ({ key: combo.subjectId, name: combo.subjectName, ...countPapers(setsBySubject.get(combo.subjectId) ?? []) }))

  // For an admin: every subject with a published paper, from the shared
  // catalogue caches, so this costs no database read.
  const withPapers = new Set(paperIndex.map((row) => row.subject_id))
  const catalogue = tree
    .map((program) => ({
      ...program,
      levels: program.levels
        .map((level) => ({ ...level, subjects: level.subjects.filter((subject) => withPapers.has(subject.id)) }))
        .filter((level) => level.subjects.length > 0),
    }))
    .filter((program) => program.levels.length > 0)

  return (
    <>
      {/* ---------------------------------------------------------- Heading */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-4">
        <div>
          <p className="text-meta text-ink-muted">
            {greeting()}, {profile.displayName.split(' ')[0]}
          </p>
          <h1 className="mt-1 text-[1.75rem] leading-tight font-medium tracking-[-0.01em] text-ink">
            Your teaching <Marked>desk</Marked>
          </h1>
        </div>
        {byRemaining[0] ? (
          <ContinueButton subjectId={byRemaining[0].subjectId} subjectSlug={byRemaining[0].subjectSlug} label="Continue where I left off" size="md" />
        ) : null}
      </header>

      {changes.length > 0 ? (
        <Link
          href="#in-progress"
          className="mt-5 flex items-center gap-3 rounded-[10px] border border-incorrect/30 bg-incorrect-soft px-4 py-2.5 text-ui text-incorrect transition-colors hover:border-incorrect/60"
        >
          <Warning size={18} aria-hidden="true" className="shrink-0" />
          <span className="flex-1">
            {formatCount(changes.length)} {changes.length === 1 ? 'explanation was' : 'explanations were'} sent back with a note.
          </span>
          <span className="flex items-center gap-1 text-meta">
            See {changes.length === 1 ? 'it' : 'them'}
            <CaretRight size={14} aria-hidden="true" />
          </span>
        </Link>
      ) : null}

      {valid.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            art="waiting-for-others"
            title={admin ? 'No subjects of your own' : 'An admin has not assigned you subjects yet'}
            actions={
              <Link href={ROUTES.teachHelp} className={buttonClass('outline', 'md')}>
                How it works
              </Link>
            }
          >
            {admin ? 'As an admin you can open any subject’s queue below.' : 'Once they do, the questions waiting to be explained appear here.'}
          </EmptyState>
        </div>
      ) : (
        <>
          {/* ---------------------------------------------- Done and left */}
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
            <Panel compact title="Your progress" note="A paper is done when every question in it is explained.">
              <dl className="grid grid-cols-2 gap-y-4 sm:grid-cols-4">
                <Figure label="Papers done" value={totals.done} strong />
                <Figure label="Papers left" value={totals.left} strong />
                <Figure label="In progress" value={totals.started} />
                <Figure label="Papers in all" value={totals.total} />
              </dl>

              <DoneLeftBar done={totals.done} total={totals.total} className="mt-5" thick />

              {breakdown.length > 1 ? (
                <ul className="mt-6 flex flex-col gap-3 border-t border-rule pt-5">
                  {breakdown.map((row) => (
                    <li key={row.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 text-meta">
                      <span className="truncate text-ink">{row.name}</span>
                      <DoneLeftBar done={row.done} total={row.total} />
                      <span className="text-ink-faint tabular-nums">
                        <span className="text-ink">{formatCount(row.done)}</span> done, {formatCount(row.left)} left
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Panel>

            <Panel compact title="Done so far" note={`${formatCount(totals.done)} of ${formatCount(totals.total)} papers done`}>
              <Gauge value={percent} label="Papers done" color="var(--color-desk)" track="var(--color-desk-soft)" />
              <p className="mt-3 text-center text-meta text-ink-muted">
                {totals.left > 0 ? `${formatCount(totals.left)} ${totals.left === 1 ? 'paper' : 'papers'} to go` : 'Every paper is done.'}
              </p>
            </Panel>
          </div>

          <Panel compact title="Teaching activity" note="Days you saved or submitted an explanation" className="mt-3">
            <ActivityCalendar days={days} ramp={TEAL_RAMP} />
          </Panel>

          {/* --------------------------------------------------- The work */}
          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <section aria-labelledby="up-next" className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 id="up-next" className="text-section font-medium text-ink">
                  Up next
                </h2>
                {current ? (
                  <Link href={queueHref(current.subjectSlug)} className="flex items-center gap-1 text-meta text-desk hover:underline">
                    All of {current.subjectName}
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                ) : null}
              </div>

              {valid.length > 1 ? (
                <nav aria-label="Subject" className="mb-3 flex flex-wrap gap-1.5">
                  {valid.map((combo) => {
                    const on = combo.subjectId === current?.subjectId
                    return (
                      <Link
                        key={`${combo.programId}:${combo.subjectId}`}
                        href={`${ROUTES.teachHome}?subject=${encodeURIComponent(combo.subjectSlug)}`}
                        aria-current={on ? 'page' : undefined}
                        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-meta transition-colors ${
                          on ? 'border-desk bg-desk-soft text-desk' : 'border-rule bg-surface text-ink-muted hover:border-rule-strong hover:text-ink'
                        }`}
                      >
                        <Art src={artFor('subjects', combo.subjectSlug)} size={18} />
                        {combo.subjectName}
                      </Link>
                    )
                  })}
                </nav>
              ) : null}

              {upNext.length > 0 ? (
                <QueueList rows={upNext} myClaims={claims.map((claim) => claim.groupKey)} subjectName={current?.subjectName ?? ''} />
              ) : (
                <Quiet icon={<CheckCircle size={22} aria-hidden="true" />} title="Every question here has been started">
                  Some may still be drafts or waiting for review.{' '}
                  {current ? (
                    <Link href={queueHref(current.subjectSlug, { filter: 'no_video' })} className="text-desk hover:underline">
                      See what still needs a video
                    </Link>
                  ) : null}
                </Quiet>
              )}
            </section>

            <aside className="flex min-w-0 flex-col gap-6">
              <section id="in-progress" className="scroll-mt-6" aria-labelledby="progress-heading">
                <h2 id="progress-heading" className="mb-3 text-section font-medium text-ink">
                  In progress
                  {inProgress.length > 0 ? <span className="ml-2 text-meta font-normal text-ink-faint tabular-nums">{inProgress.length}</span> : null}
                </h2>
                {inProgress.length > 0 ? (
                  <ExplanationList items={inProgress} />
                ) : (
                  <Quiet icon={<PencilSimpleLine size={22} aria-hidden="true" />} title="No drafts, nothing sent back">
                    Explanations you start but do not submit wait here, as does anything a reviewer asks you to change.
                  </Quiet>
                )}
              </section>

              <section aria-labelledby="done">
                <h2 id="done" className="mb-3 text-section font-medium text-ink">
                  Recently submitted
                </h2>
                {submitted.length > 0 ? (
                  <ExplanationList items={submitted} />
                ) : (
                  <p className="rounded-[12px] border border-dashed border-rule-strong px-4 py-4 text-meta text-ink-muted">
                    Nothing submitted yet. What you send for review shows here, and what is published.
                  </p>
                )}
              </section>
            </aside>
          </div>
        </>
      )}

      {/* ------------------------------------------------------ Every subject */}
      {admin ? (
        <section className="mt-10" aria-labelledby="every-subject">
          <h2 id="every-subject" className="mb-3 text-section font-medium text-ink">
            Every subject <span className="text-meta font-normal text-ink-faint">admin</span>
          </h2>
          <div className="flex flex-col gap-2">
            {catalogue.map((program) => (
              <details key={program.id} className="group rounded-[12px] border border-rule bg-surface">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-ui text-ink [&::-webkit-details-marker]:hidden">
                  <CaretRight size={14} aria-hidden="true" className="shrink-0 text-ink-faint transition-transform group-open:rotate-90" />
                  {program.name}
                </summary>
                <div className="grid gap-x-6 gap-y-4 border-t border-rule px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
                  {program.levels.map((level) => (
                    <div key={level.id}>
                      <p className="label mb-1.5">{level.name}</p>
                      <ul className="flex flex-col gap-1">
                        {level.subjects.map((subject) => (
                          <li key={subject.id}>
                            <Link href={queueHref(subject.slug)} className="text-meta text-ink-muted transition-colors hover:text-desk">
                              {subject.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}

/** A word underlined in teal marker, as a teacher underlines on the board. */
function Marked({ children }: { children: ReactNode }) {
  return (
    <span className="relative whitespace-nowrap">
      {children}
      <svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true" className="absolute -bottom-[0.22em] left-[-3%] h-[0.28em] w-[106%] text-desk">
        <path d="M2 8 C 20 3, 45 11, 62 6 S 90 4, 98 7" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
    </span>
  )
}

/** A number in the progress panel; the two that matter most, done and left, set large. */
function Figure({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <dt className="text-meta text-ink-muted">{label}</dt>
      <dd className={`mt-0.5 leading-none font-light text-ink tabular-nums ${strong ? 'text-[2.5rem]' : 'text-[1.75rem] text-ink-muted'}`}>
        {formatCount(value)}
      </dd>
    </div>
  )
}

/** Done in teal, left in grey, in one bar. */
function DoneLeftBar({ done, total, thick = false, className = '' }: { done: number; total: number; thick?: boolean; className?: string }) {
  const share = total > 0 ? Math.min((done / total) * 100, 100) : 0
  return (
    <span
      role="img"
      aria-label={`${formatCount(done)} done, ${formatCount(Math.max(total - done, 0))} left`}
      className={`block overflow-hidden rounded-full bg-surface-3 ${thick ? 'h-3' : 'h-1.5'} ${className}`}
    >
      <span className="block h-full rounded-full bg-desk" style={{ width: `${share}%` }} />
    </span>
  )
}

/** A small, calm empty state for a panel. */
function Quiet({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[12px] border border-dashed border-rule-strong bg-surface px-5 py-5">
      <span className="text-ink-faint">{icon}</span>
      <span>
        <span className="block text-ui text-ink">{title}</span>
        <span className="mt-0.5 block text-meta text-ink-muted">{children}</span>
      </span>
    </div>
  )
}
