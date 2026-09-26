import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'
import { SignOutButton } from '@/components/site/SignOutButton'
import { SHELL, TitleCard } from '@/components/site/Page'
import { ArrowRight } from '@/components/ui/icons'
import { formatSession } from '@/lib/format'
import { EmptyState } from '@/components/ui/EmptyState'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Your account', robots: { index: false } }

interface AttemptSummary {
  id: string
  score: number | null
  max_score: number | null
  submitted_at: string | null
  started_at: string
  mode: string
  question_sets: {
    set_code: string
    question_papers: {
      session_date: string | null
      exam_types: { name: string } | null
      subjects: { name: string; slug: string } | null
    } | null
  } | null
}

export default async function AccountPage() {
  if (!isSupabaseConfigured) return <SetupNotice />

  const profile = await getCurrentProfile()
  if (!profile) redirect('/?login=1&next=/account')

  const supabase = await createClient()
  const { data } = await supabase
    .from('attempts')
    .select(
      `id, score, max_score, submitted_at, started_at, mode,
       question_sets ( set_code,
         question_papers ( session_date,
           exam_types ( name ),
           subjects ( name, slug ) ) )`,
    )
    .not('submitted_at', 'is', null)
    .order('submitted_at', { ascending: false })
    .limit(50)

  const attempts = (data ?? []) as unknown as AttemptSummary[]

  return (
    <div className={`${SHELL} py-6`}>
      <TitleCard
        title={profile.displayName}
        subtitle={[profile.email, profile.role !== 'student' ? profile.role : null]
          .filter(Boolean)
          .join(' · ')}
        aside={<SignOutButton />}
      />

      <section className="mt-5 overflow-hidden rounded-card border border-rule bg-surface">
        <h2 className="px-5 pt-5 pb-3 text-[1.25rem] leading-tight font-medium text-ink">Attempt history</h2>
        {attempts.length === 0 ? (
          <div className="border-t border-rule">
            <EmptyState
              framed={false}
              art="welcome"
              title="No papers sat yet"
              actions={
                <Link href="/subjects" className="text-ui text-accent hover:underline">
                  Choose a subject
                </Link>
              }
            >
              Every paper you finish is listed here with its score.
            </EmptyState>
          </div>
        ) : (
          <ul>
            {attempts.map((attempt) => {
              const paper = attempt.question_sets?.question_papers
              const percentage =
                attempt.max_score && Number(attempt.max_score) > 0
                  ? Math.round((Number(attempt.score) / Number(attempt.max_score)) * 100)
                  : null
              return (
                <li key={attempt.id} className="border-t border-rule">
                  <Link
                    href={`/result/${attempt.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ui text-ink">
                        {paper?.subjects?.name ?? 'Question set'}
                      </span>
                      <span className="block text-meta text-ink-faint tabular-nums">
                        {[
                          paper?.exam_types?.name,
                          formatSession(paper?.session_date ?? null),
                          attempt.question_sets ? `Set ${attempt.question_sets.set_code}` : null,
                          attempt.mode === 'learning' ? 'Learning mode' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="block text-ui text-ink">
                        {Number(attempt.score ?? 0)}/{Number(attempt.max_score ?? 0)}
                      </span>
                      {percentage !== null ? (
                        <span className="block text-meta text-ink-faint">{percentage}%</span>
                      ) : null}
                    </span>
                    <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-ink-faint" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
