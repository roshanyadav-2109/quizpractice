import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getMyAttempts, getSetOverview, summariseMyAttempts } from '@/lib/queries'
import { getCurrentProfile } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'
import { SHELL, Trail } from '@/components/site/Page'
import { StartControls } from '@/components/exam/StartControls'
import { SignInLink } from '@/components/site/AuthDialog'
import { legendClasses, type PaletteState } from '@/components/exam/palette-state'
import { ArrowLeft, Check, Clock } from '@/components/ui/icons'
import { formatSession } from '@/lib/format'
import { termOf } from '@/lib/terms'

export const dynamic = 'force-dynamic'

type Params = Promise<{ setId: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  if (!isSupabaseConfigured) return { title: 'Paper' }
  const { setId } = await params
  const context = await getSetOverview(setId)
  if (!context) return { title: 'Paper not found' }
  return { title: `${context.subject.name} ${context.examType.name} — instructions` }
}

/** The palette's symbols, in the order the exam's instructions list them. */
const SYMBOLS: { state: PaletteState; meaning: string }[] = [
  { state: 'not_visited', meaning: 'You have not visited the question yet.' },
  { state: 'visited', meaning: 'You have not answered the question.' },
  { state: 'answered', meaning: 'You have answered the question.' },
  { state: 'review', meaning: 'You have not answered the question, but have marked it for review.' },
  {
    state: 'answered_review',
    meaning: 'The question is answered and marked for review. It will be evaluated.',
  },
]

/**
 * The paper's instructions, between the catalogue and the clock, set out the
 * way the exam portals students already know set them out: on the left the
 * paper and its figures, then the instructions with the palette symbols; on
 * the right the candidate, and the declaration and the way in.
 */
export default async function PaperIntroPage({ params }: { params: Params }) {
  if (!isSupabaseConfigured) return <SetupNotice />

  const { setId } = await params
  // All at once: attempts are secured to their owner, so for a visitor the
  // query simply comes back empty.
  const [context, profile, myAttempts] = await Promise.all([
    getSetOverview(setId),
    getCurrentProfile(),
    getMyAttempts(200),
  ])
  if (!context) notFound()

  const attempts = profile ? myAttempts : []
  const best = summariseMyAttempts(attempts).bySet.get(setId) ?? null

  const { paper, set, examType, subject, questions } = context
  const duration = paper.duration_minutes ?? examType.default_duration_minutes
  const marks = Number(paper.total_marks ?? 0) || questions.reduce((sum, q) => sum + Number(q.marks), 0)
  const penalised = questions.filter((q) => Number(q.negative_marks) > 0).length
  const written = questions.filter((q) => q.type === 'subjective' || q.type === 'programming').length

  // Back goes to this exam's papers for the subject — where "Start paper" was.
  const examHref = `/subject/${subject.slug}?exam=${examType.slug}`

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-surface-2">
      <div className={`${SHELL} py-5`}>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            {/* The paper and its figures. */}
            <section className="rounded-card bg-surface px-5 py-4 sm:px-6">
              <div className="flex items-start gap-2">
                <Link
                  href={examHref}
                  aria-label={`Back to ${subject.name} ${examType.name} papers`}
                  className="-ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ink transition-colors hover:bg-surface-2"
                >
                  <ArrowLeft size={18} aria-hidden="true" />
                </Link>
                <div className="min-w-0">
                  <h1 className="text-card font-medium text-ink">
                    <Trail parts={[subject.name, examType.name]} />
                  </h1>
                  <p className="mt-0.5 text-meta text-ink-faint tabular-nums">
                    <Trail
                      parts={[
                        termOf(paper.session_date)?.label,
                        formatSession(paper.session_date),
                        `Set ${set.set_code}`,
                      ].filter((part): part is string => Boolean(part))}
                    />
                  </p>
                </div>
              </div>
              <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule pt-3 text-ui text-ink">
                <Figure label="Total questions" value={String(questions.length)} />
                <Divider />
                <Figure label="Maximum marks" value={String(marks)} />
                <Divider />
                <Figure
                  icon={<Clock size={17} aria-hidden="true" />}
                  label="Duration"
                  value={duration ? `${duration} mins` : 'Untimed'}
                />
              </dl>
            </section>

            {/* The instructions. */}
            <section className="mt-4 rounded-card bg-surface">
              <div className="px-5 py-5 sm:px-6">
                <h2 className="text-card font-medium text-ink">Please read the instructions carefully</h2>
                <h3 className="mt-4 text-ui font-medium text-ink">General instructions:</h3>
                <ol className="mt-2 list-decimal space-y-2 pl-5 text-ui leading-relaxed text-ink marker:text-ink-muted">
                  <li className="pl-1">
                    {duration ? (
                      <>
                        Total duration of the paper is <Key>{duration} minutes</Key>.
                      </>
                    ) : (
                      'This paper is untimed.'
                    )}
                  </li>
                  <li className="pl-1">
                    {duration
                      ? 'The countdown timer in the top right corner of the screen shows the time left. When it reaches zero it keeps running and shows the time over, so you can finish before submitting.'
                      : 'The timer in the top right corner of the screen counts up from when you start.'}
                  </li>
                  <li className="pl-1">
                    The question palette on the right of the screen shows the status of each question using
                    one of these symbols:
                    <ul className="mt-3 divide-y divide-rule overflow-hidden rounded-control border border-rule">
                      {SYMBOLS.map(({ state, meaning }, index) => {
                        const { disc, tick } = legendClasses(state)
                        return (
                          <li
                            key={state}
                            className={`flex items-stretch ${index % 2 === 1 ? 'bg-surface-2/60' : ''}`}
                          >
                            <span className="flex w-14 shrink-0 items-center justify-center border-r border-rule py-2.5">
                              <span
                                aria-hidden
                                className={`flex h-6 w-6 items-center justify-center rounded-full ${disc}`}
                              >
                                <Check size={13} weight="bold" className={tick} />
                              </span>
                            </span>
                            <span className="px-4 py-2.5 text-ink">{meaning}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                  <li className="pl-1">
                    {penalised === 0 ? (
                      <>
                        There is <Key>no penalty</Key> for a wrong answer.
                      </>
                    ) : penalised === questions.length ? (
                      <>
                        Every question carries <Key>negative marks</Key> for a wrong answer, shown beside it.
                      </>
                    ) : (
                      <>
                        <Key>{penalised} questions</Key> carry negative marks for a wrong answer, shown beside
                        each.
                      </>
                    )}
                  </li>
                  <li className="pl-1">
                    Change an answer by choosing another option. <Key>Clear Response</Key> removes it.
                  </li>
                  <li className="pl-1">
                    <Key>Save &amp; Next</Key> saves your answer and opens the next question. The <Key>←</Key>{' '}
                    and <Key>→</Key> keys also move between questions.
                  </li>
                  <li className="pl-1">Your answers are saved on this device as you go.</li>
                  {written > 0 ? (
                    <li className="pl-1">Written and programming answers are not marked automatically.</li>
                  ) : null}
                  <li className="pl-1">
                    Do not press <Key>Submit</Key> before you finish. A submitted paper cannot be resumed.
                  </li>
                </ol>
              </div>
            </section>
          </div>

          {/* The right column, where the exam portals show the candidate: who
            is sitting, how they did before, and the way in — in view the
            whole time the instructions are being read. */}
          <aside className="rounded-card bg-surface p-5 lg:sticky lg:top-20">
            <p className="text-micro text-ink-faint">Candidate</p>
            <p className="mt-0.5 truncate text-ui text-ink">{profile?.displayName ?? 'Guest'}</p>
            {profile ? null : (
              <p className="mt-1 text-meta text-ink-muted">
                <SignInLink /> to keep this attempt and its analysis.
              </p>
            )}

            {best ? (
              <p className="mt-4 flex items-center justify-between gap-3 border-t border-rule pt-4 text-meta text-ink-muted">
                Your best
                <span className="rounded-md bg-surface-2 px-2 py-0.5 text-ui text-ink tabular-nums">
                  {best.score}/{best.maxScore}
                </span>
              </p>
            ) : null}

            <div className="mt-4 border-t border-rule pt-4">
              <StartControls setId={setId} stacked />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

/** One figure in the paper card: a label, and its value in a small grey pill. */
function Figure({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="flex items-center gap-1.5 text-ink">
        {icon}
        {label}
      </dt>
      <dd className="rounded-md bg-surface-2 px-2 py-0.5 text-ink tabular-nums">{value}</dd>
    </div>
  )
}

function Divider() {
  return <span aria-hidden className="hidden h-5 w-px bg-rule sm:block" />
}

/** The figure in a sentence that the reader must not miss. */
function Key({ children }: { children: ReactNode }) {
  return <span className="font-medium">{children}</span>
}
