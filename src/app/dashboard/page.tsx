import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getMyAnswerAnalytics, getMyAttempts, summariseMyAttempts, type MyAttempt } from '@/lib/queries'
import { getCurrentProfile } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'
import { buttonClass } from '@/components/ui/primitives'
import { SHELL } from '@/components/site/Page'
import { ArrowRight, CheckCircle, Clock, Exam, Lightning, Target } from '@/components/ui/icons'
import { formatCount, formatDuration, formatSession, formatShortDate, istDayKey } from '@/lib/format'
import { ScoreTrend, type TrendPoint } from '@/components/dashboard/ScoreTrend'
import { ActivityCalendar, AnswerSplit, Panel, StatTile, SubjectBars, type SubjectScore } from '@/components/dashboard/panels'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false } }

/** Morning, afternoon or evening in India, where the students are. */
function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(new Date()),
  )
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function percentageOf(attempt: MyAttempt): number | null {
  const max = Number(attempt.max_score ?? 0)
  return max > 0 ? Math.round((Number(attempt.score ?? 0) / max) * 100) : null
}

/** Time spent on papers finished in the last seven days. */
function secondsInLastWeek(attempts: MyAttempt[]): number {
  const since = Date.now() - 7 * 24 * 3600 * 1000
  return attempts
    .filter((a) => a.submitted_at && new Date(a.submitted_at).getTime() >= since)
    .reduce((sum, a) => sum + (a.duration_seconds ?? 0), 0)
}

/** Consecutive days with a paper, ending today (or yesterday, so a streak is not lost before today's paper). */
function streaks(days: Set<string>): { current: number; longest: number } {
  const step = (key: string, by: number) => {
    const date = new Date(`${key}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + by)
    return date.toISOString().slice(0, 10)
  }
  const today = istDayKey(new Date())
  let cursor = days.has(today) ? today : step(today, -1)
  let current = 0
  while (days.has(cursor)) {
    current += 1
    cursor = step(cursor, -1)
  }
  let longest = 0
  for (const day of days) {
    if (days.has(step(day, -1))) continue
    let run = 1
    while (days.has(step(day, run))) run += 1
    longest = Math.max(longest, run)
  }
  return { current, longest }
}

/**
 * The student's dashboard: how practice is going at a glance, then the detail
 * behind it — score over time, subjects, how answers split, what to revise,
 * how often they practise, and every recent paper. All from their own attempts.
 */
export default async function StudentDashboard() {
  if (!isSupabaseConfigured) return <SetupNotice />

  const [profile, attempts, analytics] = await Promise.all([
    getCurrentProfile(),
    getMyAttempts(300),
    getMyAnswerAnalytics(6),
  ])
  if (!profile) redirect('/?login=1&next=/dashboard')

  const firstName = profile.displayName.replace(/@.*/, '').split(/[\s._-]+/)[0]
  const progress = summariseMyAttempts(attempts)
  const last = attempts[0] ?? null

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[1.875rem] leading-tight font-light text-ink">
          {greeting()}, <span className="font-normal text-accent">{firstName}</span>
        </h1>
        <p className="mt-2 text-ui font-light text-ink-faint">
          {last ? 'Here’s how your practice is going.' : 'Your progress will build up here as you practise.'}
        </p>
      </div>
      <div className="flex gap-2">
        <Link href="/papers" className={buttonClass('outline', 'md')}>
          All papers
        </Link>
        <Link href="/subjects" className={buttonClass('primary', 'md')}>
          Start a paper
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </header>
  )

  if (!last) {
    return (
      <div className={`${SHELL} py-8`}>
        {header}
        <section className="mt-8 grid items-center gap-8 rounded-[10px] border border-rule bg-surface p-8 md:grid-cols-[320px_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/art/login/slide-2.webp" alt="" className="mx-auto w-full max-w-[300px]" />
          <div>
            <h2 className="text-[1.5rem] font-light text-ink">
              Sit your <span className="font-normal text-accent">first paper</span>
            </h2>
            <p className="mt-3 max-w-[52ch] text-ui font-light text-ink-muted">
              Pick a subject, take a previous-year paper under a real CBT timer, and your score, accuracy, weak topics and
              streak will show up here.
            </p>
            <Link href="/subjects" className={buttonClass('primary', 'lg', 'mt-6')}>
              Choose a subject
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    )
  }

  // ---- figures -------------------------------------------------------------
  const { breakdown, topics } = analytics
  const answered = breakdown.correct + breakdown.wrong
  const accuracy = answered ? Math.round((breakdown.correct / answered) * 100) : null
  const bestPct = progress.best ? percentageOf(progress.best) : null

  const totalSeconds = attempts.reduce((sum, a) => sum + (a.duration_seconds ?? 0), 0)
  const weekSeconds = secondsInLastWeek(attempts)

  const trend: TrendPoint[] = attempts
    .filter((a) => percentageOf(a) !== null && a.submitted_at)
    .slice(0, 15)
    .reverse()
    .map((a) => ({
      id: a.id,
      percentage: percentageOf(a) ?? 0,
      subject: a.subject_name,
      exam: a.exam_type_name,
      date: formatShortDate(a.submitted_at!),
    }))

  const bySubject = new Map<string, SubjectScore>()
  for (const attempt of attempts) {
    const max = Number(attempt.max_score ?? 0)
    if (max <= 0) continue
    const entry = bySubject.get(attempt.subject_slug) ?? {
      slug: attempt.subject_slug,
      name: attempt.subject_name,
      percentage: 0,
      attempts: 0,
      got: 0,
      total: 0,
    }
    entry.attempts += 1
    entry.got += Number(attempt.score ?? 0)
    entry.total += max
    entry.percentage = Math.round((entry.got / entry.total) * 100)
    bySubject.set(attempt.subject_slug, entry)
  }
  const subjects = [...bySubject.values()].sort((a, b) => b.percentage - a.percentage)

  const focus =
    topics.length > 0
      ? topics.map((t) => ({
          key: t.topic,
          label: t.topic,
          accuracy: t.accuracy,
          note: `${t.correct} of ${t.attempted} right`,
          href: `/search?q=${encodeURIComponent(t.topic)}`,
        }))
      : [...subjects]
          .sort((a, b) => a.percentage - b.percentage)
          .slice(0, 5)
          .map((s) => ({
            key: s.slug,
            label: s.name,
            accuracy: s.percentage,
            note: `average over ${s.attempts} ${s.attempts === 1 ? 'paper' : 'papers'}`,
            href: `/subject/${s.slug}`,
          }))

  const activity = new Map<string, number>()
  for (const attempt of attempts) {
    if (!attempt.submitted_at) continue
    const key = istDayKey(attempt.submitted_at)
    activity.set(key, (activity.get(key) ?? 0) + 1)
  }
  const { current: streak, longest } = streaks(new Set(activity.keys()))
  const lastPct = percentageOf(last)

  return (
    <div className={`${SHELL} py-8`}>
      {header}

      {/* At a glance */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<Exam size={20} />}
          label="Papers attempted"
          value={formatCount(progress.paperCount)}
          caption={`${formatCount(progress.attemptCount)} ${progress.attemptCount === 1 ? 'attempt' : 'attempts'} in total`}
        />
        <StatTile
          icon={<Target size={20} />}
          label="Average score"
          value={progress.averagePercentage === null ? '—' : `${progress.averagePercentage}%`}
          caption={bestPct === null ? 'No marked papers yet' : `Best ${bestPct}% · ${progress.best?.subject_name}`}
        />
        <StatTile
          icon={<CheckCircle size={20} />}
          label="Accuracy"
          value={accuracy === null ? '—' : `${accuracy}%`}
          caption={`${formatCount(breakdown.correct)} of ${formatCount(answered)} answers right`}
        />
        <StatTile
          icon={<Clock size={20} />}
          label="Time practised"
          value={formatDuration(totalSeconds)}
          caption={`This week ${formatDuration(weekSeconds)}`}
        />
      </div>

      {/* Trend + where you left off */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel
          title="Score trend"
          note={`Your last ${trend.length} ${trend.length === 1 ? 'paper' : 'papers'}, oldest to newest`}
          aside={
            progress.averagePercentage !== null ? (
              <p className="text-meta text-ink-faint">
                Average <span className="text-ink tabular-nums">{progress.averagePercentage}%</span>
              </p>
            ) : null
          }
        >
          {trend.length >= 2 ? (
            <ScoreTrend points={trend} />
          ) : (
            <div className="flex h-[240px] flex-col items-center justify-center rounded-control bg-surface-2 text-center">
              <p className="text-ui text-ink">{trend.length === 1 ? `${trend[0].percentage}% on your first paper` : 'No scores yet'}</p>
              <p className="mt-1 text-meta font-light text-ink-faint">Sit one more paper to see your trend.</p>
            </div>
          )}
        </Panel>

        <Panel title="Continue where you left off" note={`Sat ${formatShortDate(last.submitted_at ?? new Date())}`}>
          <p className="text-card font-normal text-ink">{last.subject_name}</p>
          <p className="mt-1 text-meta font-light text-ink-faint tabular-nums">
            {last.exam_type_name} · {formatSession(last.session_date)} · Set {last.set_code}
          </p>

          {lastPct !== null ? (
            <div className="mt-6">
              <div className="flex items-baseline justify-between">
                <span className="text-[2.25rem] leading-none font-light text-ink">{lastPct}%</span>
                <span className="text-meta text-ink-faint tabular-nums">
                  {Number(last.score ?? 0)} / {Number(last.max_score)} marks
                </span>
              </div>
              <div className="mt-3 h-2.5 w-full bg-accent-soft">
                <div className="h-full rounded-r-[4px] bg-accent" style={{ width: `${Math.max(2, lastPct)}%` }} />
              </div>
              {last.duration_seconds ? (
                <p className="mt-3 text-meta font-light text-ink-faint">Finished in {formatDuration(last.duration_seconds)}</p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-2">
            <Link href={`/result/${last.id}`} className={buttonClass('primary', 'md')}>
              Review answers
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href={`/practice/${last.set_id}`} className={buttonClass('outline', 'md')}>
              Try again
            </Link>
          </div>
        </Panel>
      </div>

      {/* Subjects, answers, what to revise */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Score by subject" note="Average across your papers, highest first">
          <SubjectBars subjects={subjects.slice(0, 6)} />
          {subjects.length > 6 ? (
            <p className="mt-4 text-meta font-light text-ink-faint">and {subjects.length - 6} more subjects</p>
          ) : null}
        </Panel>

        <Panel title="How your answers split" note="Every question across your papers">
          <AnswerSplit breakdown={breakdown} />
        </Panel>

        <Panel title="Focus next" note={topics.length ? 'Your weakest topics' : 'Your lowest-scoring subjects'}>
          <ol className="flex flex-col gap-4">
            {focus.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className="group block">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-ui font-light text-ink group-hover:text-accent">{item.label}</span>
                    <span className="shrink-0 text-ui text-ink tabular-nums">{item.accuracy}%</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full bg-surface-2">
                    <div className="h-full rounded-r-[4px] bg-ink-faint" style={{ width: `${Math.max(2, item.accuracy)}%` }} />
                  </div>
                  <p className="mt-1.5 text-meta font-light text-ink-faint">{item.note}</p>
                </Link>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      {/* Habit */}
      <Panel
        className="mt-4"
        title="Practice activity"
        note="Papers you finished each day over the last year"
        aside={
          <div className="flex gap-6 text-right">
            <div>
              <p className="flex items-center justify-end gap-1.5 text-[1.5rem] leading-none font-light text-ink">
                <Lightning size={18} weight="fill" className="text-marked" />
                {streak}
              </p>
              <p className="mt-1 text-meta font-light text-ink-faint">day streak</p>
            </div>
            <div>
              <p className="text-[1.5rem] leading-none font-light text-ink">{longest}</p>
              <p className="mt-1 text-meta font-light text-ink-faint">longest</p>
            </div>
            <div>
              <p className="text-[1.5rem] leading-none font-light text-ink">{activity.size}</p>
              <p className="mt-1 text-meta font-light text-ink-faint">active days</p>
            </div>
          </div>
        }
      >
        <ActivityCalendar days={activity} />
      </Panel>

      {/* Every recent paper */}
      <Panel className="mt-4" title="Recent attempts" note={attempts.length === 1 ? 'Your only paper so far' : `Your last ${Math.min(10, attempts.length)} papers`}>
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-y border-rule text-meta text-ink-faint">
                <th className="px-5 py-2.5 font-normal sm:px-6">Paper</th>
                <th className="px-3 py-2.5 font-normal">Sat on</th>
                <th className="px-3 py-2.5 text-right font-normal">Marks</th>
                <th className="px-3 py-2.5 font-normal">Score</th>
                <th className="px-3 py-2.5 text-right font-normal">Time</th>
                <th className="px-5 py-2.5 sm:px-6" />
              </tr>
            </thead>
            <tbody>
              {attempts.slice(0, 10).map((attempt) => {
                const pct = percentageOf(attempt)
                return (
                  <tr key={attempt.id} className="border-b border-rule last:border-b-0 hover:bg-surface-2">
                    <td className="px-5 py-3.5 sm:px-6">
                      <p className="text-ui text-ink">{attempt.subject_name}</p>
                      <p className="text-meta font-light text-ink-faint">
                        {attempt.exam_type_name} · {formatSession(attempt.session_date)}
                      </p>
                    </td>
                    <td className="px-3 py-3.5 text-ui font-light text-ink-muted tabular-nums">
                      {attempt.submitted_at ? formatShortDate(attempt.submitted_at) : '—'}
                    </td>
                    <td className="px-3 py-3.5 text-right text-ui text-ink tabular-nums">
                      {attempt.max_score ? `${Number(attempt.score ?? 0)} / ${Number(attempt.max_score)}` : '—'}
                    </td>
                    <td className="px-3 py-3.5">
                      {pct === null ? (
                        <span className="text-ui text-ink-faint">—</span>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 w-20 bg-surface-2">
                            <div className="h-full rounded-r-[4px] bg-accent" style={{ width: `${Math.max(2, pct)}%` }} />
                          </div>
                          <span className="w-10 text-ui text-ink tabular-nums">{pct}%</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-right text-ui font-light text-ink-muted tabular-nums">
                      {attempt.duration_seconds ? formatDuration(attempt.duration_seconds) : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right sm:px-6">
                      <Link href={`/result/${attempt.id}`} className="text-meta text-accent hover:underline">
                        Review
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
