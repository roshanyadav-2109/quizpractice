import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getMyAttempts, getMyTopicPerformance, summariseMyAttempts } from '@/lib/queries'
import { getCurrentProfile } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'
import { buttonClass } from '@/components/ui/primitives'
import { SHELL, TitleCard } from '@/components/site/Page'
import { ArrowRight } from '@/components/ui/icons'
import { formatSession } from '@/lib/format'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false } }

/** Morning, afternoon or evening in India, where the students are. */
function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-IN', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'Asia/Kolkata',
    }).format(new Date()),
  )
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * The student's dashboard: where you left off, what you have sat, and what
 * to work on next. Three things, all computed from your own attempts.
 */
export default async function StudentDashboard() {
  if (!isSupabaseConfigured) return <SetupNotice />

  // One round trip, not three: attempts and topics are secured to their
  // owner, so they can be asked for alongside the profile.
  const [profile, attempts, topicRows] = await Promise.all([
    getCurrentProfile(),
    getMyAttempts(60),
    getMyTopicPerformance(6),
  ])
  if (!profile) redirect('/?login=1&next=/dashboard')

  const progress = summariseMyAttempts(attempts)
  const topics = progress.attemptCount > 0 ? topicRows : []

  const firstName = profile.displayName.replace(/@.*/, '').split(/[\s._-]+/)[0]
  const last = attempts[0] ?? null
  const lastPercentage =
    last && last.max_score ? Math.round((Number(last.score ?? 0) / Number(last.max_score)) * 100) : null

  // Focus next: weakest topics when questions carry topics; otherwise the
  // weakest subjects, so there is always something concrete to act on.
  const bySubject = new Map<string, { name: string; slug: string; total: number; got: number }>()
  for (const attempt of attempts) {
    if (!attempt.max_score) continue
    const entry = bySubject.get(attempt.subject_slug) ?? {
      name: attempt.subject_name,
      slug: attempt.subject_slug,
      total: 0,
      got: 0,
    }
    entry.total += Number(attempt.max_score)
    entry.got += Number(attempt.score ?? 0)
    bySubject.set(attempt.subject_slug, entry)
  }
  const focus =
    topics.length > 0
      ? topics.map((t) => ({
          key: t.topic,
          label: t.topic,
          accuracy: t.accuracy,
          note: `${t.correct}/${t.attempted} right`,
          href: `/search?q=${encodeURIComponent(t.topic)}`,
        }))
      : [...bySubject.values()]
          .map((s) => ({
            key: s.slug,
            label: s.name,
            accuracy: Math.round((s.got / s.total) * 100),
            note: 'average score',
            href: `/subject/${s.slug}`,
          }))
          .sort((a, b) => a.accuracy - b.accuracy)
          .slice(0, 6)

  return (
    <div className={`${SHELL} py-6`}>
      <TitleCard title={`${greeting()}, ${firstName}.`} />

      {!last ? (
        <div className="mt-5 rounded-card border border-rule bg-surface px-6 py-12 text-center">
          <p className="text-card text-ink">You have not sat a paper yet.</p>
          <Link href="/subjects" className={buttonClass('primary', 'lg', 'mt-4')}>
            Choose a subject
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-5">
            <section className="rounded-card border border-rule bg-surface p-5">
              <h2 className="text-[1.25rem] leading-tight font-medium text-ink">
                Continue where you left off
              </h2>
              <p className="mt-3 text-card text-ink">{last.subject_name}</p>
              <p className="mt-0.5 text-meta text-ink-faint tabular-nums">
                {last.exam_type_name} · {formatSession(last.session_date)} · Set {last.set_code}
              </p>

              {lastPercentage !== null ? (
                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-meta text-ink-muted tabular-nums">
                    <span>Last score</span>
                    <span>
                      {Number(last.score ?? 0)}/{Number(last.max_score)} · {lastPercentage}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${lastPercentage}%` }} />
                  </div>
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2">
                <Link href={`/subject/${last.subject_slug}`} className={buttonClass('primary', 'md')}>
                  Continue
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link href={`/result/${last.id}`} className={buttonClass('outline', 'md')}>
                  Review
                </Link>
              </div>
            </section>

            <section className="overflow-hidden rounded-card border border-rule bg-surface">
              <h2 className="px-5 pt-5 pb-3 text-[1.25rem] leading-tight font-medium text-ink">
                Recent attempts
              </h2>
              <ul>
                {attempts.slice(0, 8).map((attempt) => {
                  const pct = attempt.max_score
                    ? Math.round((Number(attempt.score ?? 0) / Number(attempt.max_score)) * 100)
                    : null
                  return (
                    <li key={attempt.id} className="border-t border-rule">
                      <Link
                        href={`/result/${attempt.id}`}
                        className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-ui text-ink">{attempt.subject_name}</span>
                          <span className="block text-meta text-ink-faint tabular-nums">
                            {attempt.exam_type_name} · {formatSession(attempt.session_date)}
                          </span>
                        </span>
                        <span className="shrink-0 text-ui text-ink tabular-nums">
                          {pct === null ? '—' : `${pct}%`}
                        </span>
                        <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-ink-faint" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          </div>

          <section className="rounded-card border border-rule bg-surface p-5">
            <h2 className="text-[1.25rem] leading-tight font-medium text-ink">Focus next</h2>
            {focus.length > 0 ? (
              <ol className="mt-4 flex flex-col gap-4">
                {focus.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className="group block">
                      <div className="flex items-baseline justify-between gap-3 text-ui">
                        <span className="min-w-0 truncate text-ink group-hover:underline">{item.label}</span>
                        <span className="shrink-0 text-ink-muted tabular-nums">{item.accuracy}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${Math.max(3, item.accuracy)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-meta text-ink-faint tabular-nums">{item.note}</p>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-ui text-ink-muted">Sit a marked paper to see what to work on.</p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
