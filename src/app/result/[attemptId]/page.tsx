import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getPeerStats, getSetContext } from '@/lib/queries'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'
import { responseValue, selectedOptionIds } from '@/lib/scoring'
import {
  analyseQuestion,
  summarise,
  toAnalysisInput,
  type AttemptQuality,
} from '@/lib/analysis'
import { buttonClass } from '@/components/ui/primitives'
import { Breadcrumb, SHELL, TitleCard } from '@/components/site/Page'
import { ArrowRight } from '@/components/ui/icons'
import { formatSession } from '@/lib/format'
import type { AttemptAnswerRow, AttemptRow, QuestionWithOptions } from '@/types/db'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Your result', robots: { index: false } }

type Params = Promise<{ attemptId: string }>

/** The eight behaviours, in the order a student should read them. */
const BEHAVIOUR: { quality: AttemptQuality; label: string; meaning: string }[] = [
  { quality: 'perfect', label: 'Perfect', meaning: 'Right, within the expected time' },
  { quality: 'slow_correct', label: 'Slow but correct', meaning: 'Right, well over the expected time' },
  { quality: 'rushed', label: 'Rushed', meaning: 'Wrong, answered much faster than expected' },
  { quality: 'sunk', label: 'Sunk', meaning: 'Wrong, after a long time on it' },
  { quality: 'incorrect', label: 'Incorrect', meaning: 'Wrong' },
  { quality: 'abandoned', label: 'Abandoned', meaning: 'Time spent, then left blank' },
  { quality: 'skipped', label: 'Skipped', meaning: 'Not attempted' },
  { quality: 'unmarked', label: 'Unmarked', meaning: 'Written answers, not marked automatically' },
]

const TYPE_GROUP: Record<QuestionWithOptions['type'], string> = {
  mcq: 'Single correct',
  msq: 'Multiple correct',
  numerical: 'Numerical answer',
  subjective: 'Written answer',
  programming: 'Programming',
}

/**
 * One attempt, read back: the score, where the marks went, how each question
 * was handled, and every question in a table you can jump into.
 */
export default async function ResultPage({ params }: { params: Params }) {
  if (!isSupabaseConfigured) return <SetupNotice />

  const { attemptId } = await params
  const supabase = await createClient()

  // The attempt and its answers need only the attempt id, so they come
  // together; the paper and the peer figures follow once the set is known.
  const [{ data: attempt }, { data: answers }] = await Promise.all([
    supabase.from('attempts').select('*').eq('id', attemptId).maybeSingle<AttemptRow>(),
    supabase.from('attempt_answers').select('*').eq('attempt_id', attemptId).returns<AttemptAnswerRow[]>(),
  ])

  // RLS restricts attempts to their owner, so a missing row means it does not
  // exist or is not yours — both a 404 from the viewer's side.
  if (!attempt) notFound()

  const [context, peer] = await Promise.all([
    getSetContext(attempt.set_id, { includeAnswers: true }),
    getPeerStats(attempt.set_id),
  ])
  if (!context) notFound()

  const { questions, subject, examType, paper, set } = context
  const answerBy = new Map((answers ?? []).map((answer) => [answer.question_id, answer]))

  const analysed = questions.map((question) =>
    analyseQuestion(
      toAnalysisInput(question, answerBy.get(question.id) ?? null, peer.questions.get(question.id)),
    ),
  )
  const summary = summarise(analysed)

  const score = Number(attempt.score ?? 0)
  const maxScore = Number(attempt.max_score ?? 0)
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0
  const incorrect = analysed.filter((q) => q.autoMarked && q.answered && q.isCorrect === false).length
  const skipped = analysed.filter((q) => !q.answered).length

  // Where the marks went: for every auto-marked question, what it was worth
  // minus what it earned, gathered by topic — or by question type when the
  // paper has no topics tagged, so the section is never empty.
  const useTopics = questions.some((q) => q.topics.length > 0)
  const lost = new Map<string, { lost: number; right: number; total: number }>()
  for (const question of questions) {
    const answer = answerBy.get(question.id)
    if (question.type === 'subjective' || question.type === 'programming') continue
    const earned = Number(answer?.marks_awarded ?? 0)
    const groups = useTopics ? question.topics : [TYPE_GROUP[question.type]]
    for (const group of groups.length ? groups : ['Untagged']) {
      const entry = lost.get(group) ?? { lost: 0, right: 0, total: 0 }
      entry.lost += Number(question.marks) - earned
      entry.total += 1
      if (answer?.is_correct) entry.right += 1
      lost.set(group, entry)
    }
  }
  const lostRows = [...lost.entries()]
    .map(([group, entry]) => ({ group, ...entry }))
    .filter((row) => row.lost > 0)
    .sort((a, b) => b.lost - a.lost)
  const mostLost = lostRows[0]?.lost ?? 1

  const metrics = [
    { label: 'Score', value: `${score}/${maxScore}` },
    { label: 'Percentage', value: `${percentage}%` },
    { label: 'Time taken', value: attempt.duration_seconds ? clock(attempt.duration_seconds) : '—' },
    { label: 'Correct', value: String(summary.correct), tone: 'text-correct' },
    { label: 'Incorrect', value: String(incorrect), tone: 'text-incorrect' },
    { label: 'Skipped', value: String(skipped) },
  ]

  return (
    <div className={`${SHELL} py-6`}>
      <Breadcrumb
        crumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: subject.name, href: `/subject/${subject.slug}` },
          { label: examType.name },
        ]}
      />

      <TitleCard
        back={`/subject/${subject.slug}`}
        title="Your result"
        subtitle={[
          `${subject.name} · ${examType.name}`,
          formatSession(paper.session_date),
          `Set ${set.set_code}`,
        ].join(' · ')}
        aside={
          <>
            <Link href={`/practice/${set.id}?mode=learning`} className={buttonClass('outline', 'md')}>
              Learning mode
            </Link>
            <Link href={`/paper/${set.id}`} className={buttonClass('primary', 'md')}>
              Re-attempt
            </Link>
          </>
        }
      />

      <dl className="mt-5 grid grid-cols-3 overflow-hidden rounded-card border border-rule bg-rule gap-px lg:grid-cols-6">
        {metrics.map((metric) => (
          <div key={metric.label} className="bg-surface px-4 py-4 sm:px-5">
            <dt className="text-meta text-ink-faint">{metric.label}</dt>
            <dd className={`mt-1 text-[1.375rem] leading-tight tabular-nums ${metric.tone ?? 'text-ink'}`}>
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>

      {peer.set?.your_rank ? (
        <p className="mt-3 text-meta text-ink-muted tabular-nums">
          Rank {peer.set.your_rank} of {peer.set.attempt_count} · average {peer.set.avg_percentage}% ·
          median {peer.set.median_percentage}%
        </p>
      ) : null}

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <section className="rounded-card border border-rule bg-surface p-5">
          <h2 className="text-[1.25rem] leading-tight font-medium text-ink">Where did you lose marks?</h2>
          {lostRows.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-3.5">
              {lostRows.map((row) => (
                <li key={row.group}>
                  <div className="flex items-baseline justify-between gap-3 text-ui">
                    <span className="min-w-0 truncate text-ink">{row.group}</span>
                    <span className="shrink-0 text-ink-muted tabular-nums">
                      −{trim(row.lost)} <span className="text-ink-faint">· {row.right}/{row.total} right</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(4, (row.lost / mostLost) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-ui text-ink-muted">No marks lost on the questions marked automatically.</p>
          )}
        </section>

        <section className="rounded-card border border-rule bg-surface p-5">
          <h2 className="text-[1.25rem] leading-tight font-medium text-ink">Question behaviour</h2>
          <dl className="mt-3 flex flex-col">
            {BEHAVIOUR.map(({ quality, label, meaning }) => (
              <div
                key={quality}
                className="flex items-baseline justify-between gap-4 border-b border-rule py-2.5 last:border-0"
              >
                <dt className="min-w-0">
                  <span className="text-ui text-ink">{label}</span>
                  <span className="ml-2 text-meta text-ink-faint">{meaning}</span>
                </dt>
                <dd
                  className={`shrink-0 text-ui tabular-nums ${
                    summary.counts[quality] > 0 ? 'text-ink' : 'text-ink-faint'
                  }`}
                >
                  {summary.counts[quality]}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className="mt-5 overflow-hidden rounded-card border border-rule bg-surface">
        <h2 className="px-5 pt-5 pb-3 text-[1.25rem] leading-tight font-medium text-ink">
          Question by question
        </h2>
        {/* Wide on purpose; on a phone it scrolls inside its own box. Relative
            so the screen-reader-only header text is clipped with the table
            instead of anchoring to the page and widening it. */}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-ui">
            <thead className="border-y border-rule bg-surface-2 text-meta text-ink-muted">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-normal">Question</th>
                <th scope="col" className="px-3 py-2.5 font-normal">Your answer</th>
                <th scope="col" className="px-3 py-2.5 font-normal">Correct answer</th>
                <th scope="col" className="px-3 py-2.5 text-right font-normal">Marks</th>
                <th scope="col" className="px-3 py-2.5 text-right font-normal">Time</th>
                <th scope="col" className="px-5 py-2.5 text-right font-normal">
                  <span className="sr-only">Solution</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {questions.map((question, i) => {
                const answer = answerBy.get(question.id) ?? null
                const row = analysed[i]
                const awarded = answer?.marks_awarded
                return (
                  <tr key={question.id} className="border-b border-rule last:border-0">
                    <td className="px-5 py-3 text-ink tabular-nums">Q{question.number}</td>
                    <td className="px-3 py-3 tabular-nums">{yourAnswer(question, answer)}</td>
                    <td className="px-3 py-3 text-ink-muted tabular-nums">{correctAnswer(question)}</td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums ${
                        !row.autoMarked
                          ? 'text-ink-faint'
                          : awarded && awarded > 0
                            ? 'text-correct'
                            : awarded && awarded < 0
                              ? 'text-incorrect'
                              : 'text-ink-muted'
                      }`}
                    >
                      {!row.autoMarked ? '—' : `${awarded && awarded > 0 ? '+' : ''}${trim(Number(awarded ?? 0))}`}
                    </td>
                    <td className="px-3 py-3 text-right text-ink-muted tabular-nums">
                      {row.timeSpentSeconds !== null ? clock(row.timeSpentSeconds) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/practice/${set.id}?mode=learning&q=${question.number}`}
                        className="inline-flex items-center gap-1 whitespace-nowrap text-accent hover:underline"
                      >
                        Solution
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

/** What the student put: option letters, a value, or that they wrote something. */
function yourAnswer(question: QuestionWithOptions, answer: AttemptAnswerRow | null) {
  const chosen = new Set(selectedOptionIds(answer?.response))
  if (question.type === 'mcq' || question.type === 'msq') {
    const letters = question.options.filter((o) => chosen.has(o.id)).map((o) => o.label)
    if (letters.length === 0) return <span className="text-ink-faint">—</span>
    const right = answer?.is_correct
    return <span className={right ? 'text-correct' : 'text-incorrect'}>{letters.join(', ')}</span>
  }
  const value = responseValue(answer?.response)
  if (!value) return <span className="text-ink-faint">—</span>
  if (question.type === 'numerical') {
    return <span className={answer?.is_correct ? 'text-correct' : 'text-incorrect'}>{value}</span>
  }
  return <span className="text-ink-muted">Written</span>
}

function correctAnswer(question: QuestionWithOptions): string {
  if (question.type === 'mcq' || question.type === 'msq') {
    const letters = question.options.filter((o) => o.is_correct).map((o) => o.label)
    return letters.length ? letters.join(', ') : '—'
  }
  if (question.type === 'numerical') return question.correct_answer ?? '—'
  return 'See solution'
}

function clock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.round(totalSeconds % 60)
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  return `${seconds}s`
}

/** 3 → "3", 2.5 → "2.5", 0.333… → "0.33". */
function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}
