import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getMistakeBank, getQuestionsWithAnswers, getSolutionsForSet } from '@/lib/queries'
import { getCurrentProfile } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'
import { MistakeReview, type ReviewItem } from '@/components/mistakes/MistakeReview'
import { formatSession } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Retry mistakes', robots: { index: false } }

const SESSION = 10

type SearchParams = Promise<{ subject?: string }>

/** Up to ten mistakes to retry: due recaps first, then the most recent misses. */
export default async function RetryMistakes({ searchParams }: { searchParams: SearchParams }) {
  if (!isSupabaseConfigured) return <SetupNotice />
  const [profile, { subject }] = await Promise.all([getCurrentProfile(), searchParams])
  const back = subject ? `/mistakes?subject=${subject}` : '/mistakes'
  if (!profile) redirect(`/?login=1&next=${encodeURIComponent(subject ? `/mistakes/practice?subject=${subject}` : '/mistakes/practice')}`)

  const bank = (await getMistakeBank()).filter((m) => !subject || m.subjectSlug === subject)
  const due = [...bank.filter((m) => m.state === 'recap'), ...bank.filter((m) => m.state === 'open')].slice(0, SESSION)
  if (!due.length) redirect(back)

  const [questions, solutions] = await Promise.all([
    getQuestionsWithAnswers(due.map((m) => m.questionId)),
    getSolutionsForSet(due.map((m) => m.questionId)),
  ])
  const meta = new Map(due.map((m) => [m.questionId, m]))
  const items: ReviewItem[] = questions.flatMap((question) => {
    const m = meta.get(question.id)
    return m
      ? [{ question, subject: m.subjectName, label: `${m.examName} · ${formatSession(m.session)} · Q${m.number}` }]
      : []
  })

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-canvas">
      <div className="mx-auto w-full max-w-[56rem] px-4 py-8 sm:px-6">
        <h1 className="mb-5 text-[1.5rem] leading-tight font-light text-ink">
          Retry your <span className="font-normal text-accent">mistakes</span>
        </h1>
        <MistakeReview items={items} solutions={solutions} backHref={back} />
      </div>
    </div>
  )
}
