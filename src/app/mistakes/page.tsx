import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getMistakeBank, type MistakeState } from '@/lib/queries'
import { getCurrentProfile } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'
import { buttonClass } from '@/components/ui/primitives'
import { ArrowRight } from '@/components/ui/icons'
import { formatSession, formatShortDate } from '@/lib/format'
import { EmptyState } from '@/components/ui/EmptyState'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Mistake bank', robots: { index: false } }

const WIDE = 'mx-auto w-full max-w-[100rem] px-4 sm:px-6 lg:px-10'
const SHOWN = 60

const STATES: { key: MistakeState; label: string; note: string; dot: string; badge: string }[] = [
  { key: 'open', label: 'Open', note: 'Still wrong', dot: 'bg-incorrect', badge: 'bg-incorrect-soft text-incorrect' },
  { key: 'recap', label: 'Due for a recap', note: 'Put right once — check it stuck', dot: 'bg-marked', badge: 'bg-marked-soft text-marked' },
  { key: 'fixed', label: 'Fixed', note: 'Right since your last miss', dot: 'bg-correct', badge: 'bg-correct-soft text-correct' },
]

type SearchParams = Promise<{ subject?: string; state?: string }>

/** Every question the student has got wrong or left blank, and where it stands. */
export default async function MistakesPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isSupabaseConfigured) return <SetupNotice />
  const [profile, query] = await Promise.all([getCurrentProfile(), searchParams])
  if (!profile) redirect('/?login=1&next=/mistakes')

  const all = await getMistakeBank()
  const subject = query.subject ?? null
  const state = STATES.some((s) => s.key === query.state) ? (query.state as MistakeState) : null

  const inSubject = subject ? all.filter((m) => m.subjectSlug === subject) : all
  const shown = state ? inSubject.filter((m) => m.state === state) : inSubject
  const due = inSubject.filter((m) => m.state !== 'fixed').length

  const subjects = [...new Map(all.map((m) => [m.subjectSlug, m.subjectName])).entries()]
    .map(([slug, name]) => ({ slug, name, open: all.filter((m) => m.subjectSlug === slug && m.state !== 'fixed').length }))
    .sort((a, b) => b.open - a.open)

  const href = (next: { subject?: string | null; state?: string | null }) => {
    const params = new URLSearchParams()
    const s = next.subject === undefined ? subject : next.subject
    const st = next.state === undefined ? state : next.state
    if (s) params.set('subject', s)
    if (st) params.set('state', st)
    const qs = params.toString()
    return qs ? `/mistakes?${qs}` : '/mistakes'
  }
  const practiceHref = subject ? `/mistakes/practice?subject=${subject}` : '/mistakes/practice'

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-canvas">
      <div className={`${WIDE} py-8`}>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[1.875rem] leading-tight font-light text-ink">
              Your <span className="font-normal text-accent">mistake bank</span>
            </h1>
            <p className="mt-2 max-w-[60ch] text-ui font-light text-ink-faint">
              Every question you got wrong or left blank. Put one right and it comes back once, a few days later, to
              check it stuck.
            </p>
          </div>
          {due > 0 ? (
            <Link href={practiceHref} className={buttonClass('primary', 'md')}>
              Retry {Math.min(10, due)} {Math.min(10, due) === 1 ? 'mistake' : 'mistakes'}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ) : null}
        </header>

        {all.length === 0 ? (
          <EmptyState
            className="mt-8"
            art="welcome"
            title="Nothing here yet"
            actions={
              <Link href="/subjects" className={buttonClass('primary', 'md')}>
                Sit a paper
              </Link>
            }
          >
            Questions you get wrong in a paper collect here automatically.
          </EmptyState>
        ) : (
          <>
            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              {STATES.map((s) => {
                const count = inSubject.filter((m) => m.state === s.key).length
                const active = state === s.key
                return (
                  <Link
                    key={s.key}
                    href={href({ state: active ? null : s.key })}
                    className={`rounded-[10px] border bg-surface p-5 transition-colors ${
                      active ? 'border-accent ring-1 ring-accent' : 'border-rule hover:border-rule-strong'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-meta text-ink-muted">
                      <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} aria-hidden="true" />
                      {s.label}
                    </span>
                    <span className="mt-2 block text-[2rem] leading-none font-light text-ink">{count}</span>
                    <span className="mt-2 block text-meta font-light text-ink-faint">{s.note}</span>
                  </Link>
                )
              })}
            </div>

            {due === 0 ? (
              <EmptyState className="mt-5" size="sm" art="all-clear" title="All caught up">
                Every mistake {subject ? 'in this subject ' : ''}is fixed for now. Recaps come back here when they are due.
              </EmptyState>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={href({ subject: null })}
                className={`rounded-full border px-3.5 py-1.5 text-meta ${
                  !subject ? 'border-accent bg-accent-soft text-accent' : 'border-rule bg-surface text-ink-muted hover:text-ink'
                }`}
              >
                All subjects
              </Link>
              {subjects.map((s) => (
                <Link
                  key={s.slug}
                  href={href({ subject: s.slug })}
                  className={`rounded-full border px-3.5 py-1.5 text-meta ${
                    subject === s.slug ? 'border-accent bg-accent-soft text-accent' : 'border-rule bg-surface text-ink-muted hover:text-ink'
                  }`}
                >
                  {s.name} <span className="tabular-nums text-ink-faint">{s.open}</span>
                </Link>
              ))}
            </div>

            <section className="mt-5 overflow-hidden rounded-[10px] border border-rule bg-surface">
              {shown.length === 0 ? (
                <EmptyState framed={false} size="sm" art="no-results" title="Nothing in this view">
                  Pick another status or subject.
                </EmptyState>
              ) : (
                <ul>
                  {shown.slice(0, SHOWN).map((m) => {
                    const s = STATES.find((x) => x.key === m.state)!
                    return (
                      <li key={m.questionId} className="border-b border-rule last:border-b-0">
                        <div className="flex flex-wrap items-start gap-x-5 gap-y-2 px-6 py-4 sm:flex-nowrap">
                          <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-[0.75rem] ${s.badge}`}>{s.label}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-meta text-ink-faint">
                              <span className="text-ink-muted">{m.subjectName}</span> · {m.examName} · {formatSession(m.session)} · Q
                              {m.number}
                            </p>
                            <p className="mt-1 line-clamp-2 text-ui font-light text-ink">{m.snippet}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-meta text-ink-muted tabular-nums">
                              missed {m.misses}×
                            </p>
                            <p className="text-meta font-light text-ink-faint">
                              {m.recapOn ? `recap ${formatShortDate(m.recapOn)}` : `last seen ${formatShortDate(m.lastSeen)}`}
                            </p>
                          </div>
                          <Link
                            href={`/practice/${m.setId}?mode=learning&q=${m.number}`}
                            className="shrink-0 self-center text-meta text-accent hover:underline"
                          >
                            In paper
                          </Link>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              {shown.length > SHOWN ? (
                <p className="border-t border-rule px-6 py-3 text-meta font-light text-ink-faint">
                  Showing {SHOWN} of {shown.length}. Retry some, or pick a subject, to see the rest.
                </p>
              ) : null}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
