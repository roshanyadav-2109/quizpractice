import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import {
  getExamTypes,
  getLeaderboard,
  getMistakeBank,
  getMyPeerGaps,
  getMyAnswerAnalytics,
  getMyAttempts,
  getSubjectBySlug,
  getSuggestedSets,
  summariseMyAttempts,
  type AnswerBreakdown,
  type LeaderboardScope,
  type QualityCounts,
  type MyAttempt,
} from '@/lib/queries'
import { getCurrentProfile } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'
import { buttonClass } from '@/components/ui/primitives'
import { ArrowRight, Lightning } from '@/components/ui/icons'
import { formatCount, formatDuration, formatSession, formatShortDate, istDayKey } from '@/lib/format'
import { MetricExplorer, type MetricKey, type MetricSummary, type PaperPoint } from '@/components/dashboard/MetricExplorer'
import { PaperCarousel, type CarouselPaper } from '@/components/dashboard/PaperCarousel'
import { Leaderboard, type Board } from '@/components/dashboard/Leaderboard'
import { SpeedMap, type SubjectQuality } from '@/components/dashboard/SpeedMap'
import { artFor } from '@/lib/art'
import { ActivityCalendar, AnswerSplit, Gauge, Panel, SubjectBars, type SubjectScore } from '@/components/dashboard/panels'
import { EmptyState } from '@/components/ui/EmptyState'

export const dynamic = 'force-dynamic'

/** Wider than the site's reading width: a dashboard is scanned, not read. */
const WIDE = 'mx-auto w-full max-w-[100rem] px-4 sm:px-6 lg:px-10'

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

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length

/** Recent papers against the same number just before them, once there are two. */
function recentChange(values: number[]): number | null {
  if (values.length < 2) return null
  const k = Math.min(5, Math.floor(values.length / 2))
  return mean(values.slice(-k)) - mean(values.slice(-2 * k, -k))
}

function paperMetrics(attempt: MyAttempt, split: AnswerBreakdown | undefined) {
  const total = split ? split.correct + split.wrong + split.skipped + split.unmarked : 0
  const answered = split ? split.correct + split.wrong : 0
  return {
    score: percentageOf(attempt),
    accuracy: split && answered ? (split.correct / answered) * 100 : null,
    attemptRate: split && total ? ((total - split.skipped) / total) * 100 : null,
    secPerQ: split && split.timedAnswers ? split.timeSpent / split.timedAnswers : null,
  }
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
      <div className="min-h-[calc(100dvh-4rem)] bg-canvas">
      <div className={`${WIDE} py-8`}>
        {header}
        <section className="mt-8 grid items-center gap-8 rounded-[10px] border border-rule bg-surface p-8 md:grid-cols-[320px_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/art/states/welcome.webp" alt="" className="mx-auto w-full max-w-[300px]" />
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
      </div>
    )
  }

  // ---- figures -------------------------------------------------------------
  const { breakdown, byAttempt, topics } = analytics
  const chronological = [...attempts].reverse()
  const metricsFor = (attempt: MyAttempt) => paperMetrics(attempt, byAttempt[attempt.id])

  const points: PaperPoint[] = chronological
    .filter((a) => a.submitted_at)
    .slice(-15)
    .map((a) => ({
      id: a.id,
      date: formatShortDate(a.submitted_at!),
      subject: a.subject_name,
      exam: a.exam_type_name,
      ...metricsFor(a),
    }))

  const answered = breakdown.correct + breakdown.wrong
  const totalAnswers = answered + breakdown.skipped + breakdown.unmarked
  const series = (key: MetricKey) =>
    chronological.map((a) => metricsFor(a)[key]).filter((v): v is number => v !== null)
  const summary: Record<MetricKey, MetricSummary> = {
    score: { value: progress.averagePercentage, delta: recentChange(series('score')) },
    accuracy: { value: answered ? (breakdown.correct / answered) * 100 : null, delta: recentChange(series('accuracy')) },
    attemptRate: {
      value: totalAnswers ? ((totalAnswers - breakdown.skipped) / totalAnswers) * 100 : null,
      delta: recentChange(series('attemptRate')),
    },
    secPerQ: {
      value: breakdown.timedAnswers ? breakdown.timeSpent / breakdown.timedAnswers : null,
      delta: recentChange(series('secPerQ')),
    },
  }

  const scores = series('score')
  const formWindow = scores.slice(-5)
  const form = formWindow.length ? mean(formWindow) : null
  const formVsOverall = form !== null && progress.averagePercentage !== null ? form - progress.averagePercentage : null
  const bestPct = progress.best ? percentageOf(progress.best) : null
  const weekSeconds = secondsInLastWeek(attempts)

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

  // Recommended papers and the leaderboards both follow what is practised most:
  // the top subject (and its level and branch) and the most-sat exam.
  const practised = [...bySubject.values()].sort((a, b) => b.attempts - a.attempts).map((s) => s.slug)
  const examCounts = new Map<string, number>()
  for (const attempt of attempts) examCounts.set(attempt.exam_type_name, (examCounts.get(attempt.exam_type_name) ?? 0) + 1)
  const topExamName = [...examCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const [suggested, topSubject, examTypes, mistakes, peerGaps] = await Promise.all([
    getSuggestedSets(practised, new Set(progress.bySet.keys()), 12),
    practised[0] ? getSubjectBySlug(practised[0]) : Promise.resolve(null),
    getExamTypes(),
    getMistakeBank(),
    getMyPeerGaps(6),
  ])
  const topExam = examTypes.find((type) => type.name === topExamName) ?? null

  type BoardSpec = Omit<Board, 'rows'> & { scope: LeaderboardScope; scopeKey: string | null }
  const boardSpecs: BoardSpec[] = [
    { key: 'overall', label: 'Overall', note: 'Every paper on QuizPractice', scope: 'overall', scopeKey: null },
    ...(topSubject
      ? [
          { key: 'subject', label: topSubject.subject.name, note: `${topSubject.subject.name} papers`, scope: 'subject' as const, scopeKey: topSubject.subject.slug },
        ]
      : []),
    ...(topExam ? [{ key: 'exam', label: topExam.name, note: `Every ${topExam.name} paper`, scope: 'exam' as const, scopeKey: topExam.slug }] : []),
    ...(topSubject
      ? [
          { key: 'level', label: topSubject.level.name, note: `Subjects in ${topSubject.level.name}, ${topSubject.program.short_name ?? topSubject.program.name}`, scope: 'level' as const, scopeKey: topSubject.level.id },
          { key: 'program', label: topSubject.program.short_name ?? topSubject.program.name, note: `Every subject in ${topSubject.program.name}`, scope: 'program' as const, scopeKey: topSubject.program.slug },
        ]
      : []),
  ]
  const boards: Board[] = await Promise.all(
    boardSpecs.map(async ({ scope, scopeKey, ...spec }) => ({ ...spec, rows: await getLeaderboard(scope, scopeKey, 10) })),
  )
  const carousel: CarouselPaper[] = suggested.map((set) => ({
    setId: set.set_id,
    subject: set.subject_name,
    exam: set.exam_type_name,
    session: formatSession(set.session_date),
    setCode: set.set_code,
    art: artFor('subjects', set.subject_slug),
  }))


  // Speed against accuracy: every answer's class, overall and per subject.
  const subjectOfAttempt = new Map(attempts.map((a) => [a.id, { slug: a.subject_slug, name: a.subject_name }]))
  const qualityOverall: QualityCounts = {}
  const qualityBySubject = new Map<string, SubjectQuality>()
  for (const [attemptId, counts] of Object.entries(analytics.qualityByAttempt)) {
    const subject = subjectOfAttempt.get(attemptId)
    for (const [quality, n] of Object.entries(counts) as [keyof QualityCounts, number][]) {
      qualityOverall[quality] = (qualityOverall[quality] ?? 0) + n
      if (!subject) continue
      const entry = qualityBySubject.get(subject.slug) ?? { slug: subject.slug, name: subject.name, counts: {} }
      entry.counts[quality] = (entry.counts[quality] ?? 0) + n
      qualityBySubject.set(subject.slug, entry)
    }
  }
  const zone = (counts: QualityCounts, ...keys: (keyof QualityCounts)[]) => keys.reduce((sum, k) => sum + (counts[k] ?? 0), 0)
  const qualitySubjects = [...qualityBySubject.values()]
    .filter((s) => zone(s.counts, 'perfect', 'slow_correct', 'incorrect', 'rushed', 'sunk') > 0)
    .sort((a, b) => zone(b.counts, 'perfect') / Math.max(1, zone(b.counts, 'perfect', 'slow_correct', 'incorrect', 'rushed', 'sunk')) - zone(a.counts, 'perfect') / Math.max(1, zone(a.counts, 'perfect', 'slow_correct', 'incorrect', 'rushed', 'sunk')))
    .slice(0, 7)

  // Plain-language findings: the subject where each pattern is strongest.
  const findings: { share: number; text: string }[] = []
  const strongest = (share: (c: QualityCounts) => number | null) =>
    [...qualityBySubject.values()]
      .filter((s) => zone(s.counts, 'perfect', 'slow_correct', 'incorrect', 'rushed', 'sunk') >= 10)
      .map((s) => ({ s, share: share(s.counts) }))
      .filter((x): x is { s: SubjectQuality; share: number } => x.share !== null)
      .sort((a, b) => b.share - a.share)[0]
  const careless = strongest((c) => (zone(c, 'rushed', 'incorrect', 'sunk') >= 4 ? zone(c, 'rushed') / zone(c, 'rushed', 'incorrect', 'sunk') : null))
  if (careless && careless.share >= 0.25)
    findings.push({
      share: careless.share,
      text: `In ${careless.s.name}, ${Math.round(careless.share * 100)}% of your wrong answers were rushed. Slow down and re-read the question before answering.`,
    })
  const slow = strongest((c) => (zone(c, 'perfect', 'slow_correct') >= 4 ? zone(c, 'slow_correct') / zone(c, 'perfect', 'slow_correct') : null))
  if (slow && slow.share >= 0.25)
    findings.push({
      share: slow.share,
      text: `In ${slow.s.name} you're accurate but slow: ${Math.round(slow.share * 100)}% of your right answers took longer than their marks allow. Timed practice will help.`,
    })
  const sunk = strongest((c) => (zone(c, 'rushed', 'incorrect', 'sunk') >= 4 ? zone(c, 'sunk') / zone(c, 'rushed', 'incorrect', 'sunk') : null))
  if (sunk && sunk.share >= 0.25)
    findings.push({
      share: sunk.share,
      text: `In ${sunk.s.name}, ${Math.round(sunk.share * 100)}% of your wrong answers came after a long struggle. Revise the concepts before practising more papers.`,
    })
  const best = strongest((c) => zone(c, 'perfect') / zone(c, 'perfect', 'slow_correct', 'incorrect', 'rushed', 'sunk'))
  if (best && best.share >= 0.4)
    findings.push({
      share: best.share * 0.5,
      text: `${best.s.name} is your strongest: ${Math.round(best.share * 100)}% of answers there were right and on pace.`,
    })
  const speedInsights = findings.sort((a, b) => b.share - a.share).slice(0, 3).map((f) => f.text)

  // Mistake bank summary.
  const mistakeCounts = {
    open: mistakes.filter((m) => m.state === 'open').length,
    recap: mistakes.filter((m) => m.state === 'recap').length,
    fixed: mistakes.filter((m) => m.state === 'fixed').length,
  }
  const mistakeSubjects = [...new Map(mistakes.map((m) => [m.subjectSlug, m.subjectName])).entries()]
    .map(([slug, name]) => ({ slug, name, open: mistakes.filter((m) => m.subjectSlug === slug && m.state !== 'fixed').length }))
    .filter((s) => s.open > 0)
    .sort((a, b) => b.open - a.open)
    .slice(0, 4)

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
    <div className="min-h-[calc(100dvh-4rem)] bg-canvas">
      <div className={`${WIDE} py-8`}>
        {header}

        {/* Performance, with a dial for recent form */}
        <div className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Panel title="Performance" note="Pick a figure to see it paper by paper">
            <MetricExplorer points={points} summary={summary} />
          </Panel>

          <Panel
            title="Recent form"
            note={`Average score on your last ${formWindow.length} ${formWindow.length === 1 ? 'paper' : 'papers'}`}
          >
            {form !== null ? (
              <div>
                <Gauge value={form} label="Recent form" />
                <p className="mt-3 text-center text-meta font-light text-ink-faint">
                  {formVsOverall === null || Math.round(formVsOverall) === 0 ? (
                    'In line with your overall average'
                  ) : (
                    <>
                      <span className={formVsOverall > 0 ? 'text-correct' : 'text-incorrect'}>
                        {formVsOverall > 0 ? '▲' : '▼'} {Math.abs(Math.round(formVsOverall))} pts
                      </span>{' '}
                      {formVsOverall > 0 ? 'above' : 'below'} your overall average
                    </>
                  )}
                </p>
                <dl className="mt-6 grid grid-cols-3 gap-2 border-t border-rule pt-5 text-center">
                  <div>
                    <dt className="text-meta font-light text-ink-faint">Best</dt>
                    <dd className="mt-1 text-card text-ink">{bestPct === null ? '—' : `${bestPct}%`}</dd>
                  </div>
                  <div>
                    <dt className="text-meta font-light text-ink-faint">Papers</dt>
                    <dd className="mt-1 text-card text-ink">{formatCount(progress.paperCount)}</dd>
                  </div>
                  <div>
                    <dt className="text-meta font-light text-ink-faint">This week</dt>
                    <dd className="mt-1 text-card text-ink">{formatDuration(weekSeconds)}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="text-ui font-light text-ink-muted">Your form appears once a paper is marked.</p>
            )}
          </Panel>
        </div>

        {/* Speed against accuracy */}
        <Panel
          className="mt-4"
          title="Speed vs accuracy"
          note="Every answer, placed by whether it was right and how long it took"
        >
          <SpeedMap overall={qualityOverall} subjects={qualitySubjects} insights={speedInsights} />
        </Panel>

        {/* Gaps against other students, and the mistake bank */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Panel
            title="Easy for others, missed by you"
            note="Questions you got wrong that most students get right — your real gaps"
          >
            {peerGaps.length > 0 ? (
              <ul className="flex flex-col">
                {peerGaps.map((gap) => (
                  <li key={gap.questionId} className="border-b border-rule py-3.5 first:pt-0 last:border-b-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-ui text-ink">
                          {gap.subjectName} <span className="text-ink-faint">· Q{gap.number}</span>
                        </p>
                        <p className="text-meta font-light text-ink-faint">
                          {gap.examName} · {formatSession(gap.session)}
                        </p>
                      </div>
                      <div className="w-44">
                        <div className="flex items-baseline justify-between text-meta">
                          <span className="text-ink-muted">Others right</span>
                          <span className="text-ink tabular-nums">{Math.round(gap.peerCorrect)}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 bg-surface-2">
                          <div className="h-full rounded-r-[4px] bg-accent" style={{ width: `${gap.peerCorrect}%` }} />
                        </div>
                        <p className="mt-1 text-[0.75rem] font-light text-ink-faint tabular-nums">of {gap.peerCount} students</p>
                      </div>
                      <p className="w-40 text-meta font-light text-ink-muted tabular-nums">
                        {gap.answered
                          ? `You ${gap.yourSeconds ? formatDuration(gap.yourSeconds) : '—'} · them ${gap.peerSeconds ? formatDuration(gap.peerSeconds) : '—'}`
                          : 'You left it blank'}
                      </p>
                      <Link
                        href={`/practice/${gap.setId}?mode=learning&q=${gap.number}`}
                        className="text-meta text-accent hover:underline"
                      >
                        See solution
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState framed={false} size="sm" art="waiting-for-others" title="Waiting for more students">
                This compares each question you missed with how other students did on it. It appears once at least three
                other students have answered the same questions.
              </EmptyState>
            )}
          </Panel>

          <Panel title="Mistake bank" note="Questions you got wrong or left blank">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Open', value: mistakeCounts.open, dot: 'bg-incorrect' },
                { label: 'Recap due', value: mistakeCounts.recap, dot: 'bg-marked' },
                { label: 'Fixed', value: mistakeCounts.fixed, dot: 'bg-correct' },
              ].map((cell) => (
                <div key={cell.label} className="rounded-control bg-surface-2 px-2 py-3">
                  <p className="text-[1.5rem] leading-none font-light text-ink">{cell.value}</p>
                  <p className="mt-1.5 flex items-center justify-center gap-1.5 text-meta font-light text-ink-faint">
                    <span className={`h-2 w-2 rounded-full ${cell.dot}`} aria-hidden="true" />
                    {cell.label}
                  </p>
                </div>
              ))}
            </div>
            {mistakeSubjects.length > 0 ? (
              <ul className="mt-5 flex flex-col gap-2.5">
                {mistakeSubjects.map((s) => (
                  <li key={s.slug}>
                    <Link href={`/mistakes?subject=${s.slug}`} className="flex items-baseline justify-between gap-3 text-ui hover:text-accent">
                      <span className="min-w-0 truncate font-light">{s.name}</span>
                      <span className="shrink-0 text-meta text-ink-faint tabular-nums">{s.open} to fix</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-2">
              {mistakeCounts.open + mistakeCounts.recap > 0 ? (
                <Link href="/mistakes/practice" className={buttonClass('primary', 'md')}>
                  Retry mistakes
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              ) : null}
              <Link href="/mistakes" className={buttonClass('outline', 'md')}>
                Open bank
              </Link>
            </div>
          </Panel>
        </div>

        {/* What to sit next */}
        {carousel.length > 0 ? (
          <Panel className="mt-4" title="Recommended for you" note="Papers from your subjects you haven’t sat yet, newest first">
            <PaperCarousel papers={carousel} />
          </Panel>
        ) : null}

        {/* Where you stand, and by subject */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Panel title="Leaderboard" note="Students ranked by their average best score per paper">
            <Leaderboard boards={boards} />
          </Panel>
          <Panel title="Score by subject" note="Average across your papers, highest first">
            <SubjectBars subjects={subjects.slice(0, 8)} />
            {subjects.length > 8 ? (
              <p className="mt-4 text-meta font-light text-ink-faint">and {subjects.length - 8} more subjects</p>
            ) : null}
          </Panel>
        </div>

        {/* Where you left off, how answers split, what to revise */}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
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
        <div className="mt-4">
          <Panel
            title="Recent attempts"
            note={attempts.length === 1 ? 'Your only paper so far' : `Your last ${Math.min(10, attempts.length)} papers`}
          >
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="w-full min-w-[600px] text-left">
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
                              <div className="h-1.5 w-16 bg-surface-2">
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
      </div>
    </div>
  )
}
