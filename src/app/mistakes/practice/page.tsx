import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getMistakeBank, getQuestionsWithAnswers, getSolutionsForSet } from '@/lib/queries'
import { getCurrentProfile } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'
import { ExamRunner } from '@/components/exam/ExamRunner'
import { formatSession } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Retry mistakes', robots: { index: false } }

const SESSION = 10

type SearchParams = Promise<{ subject?: string }>

/**
 * Up to ten mistakes to retry — due recaps first, then the most recent misses —
 * on the same screen as learning mode, so retrying feels like practising.
 */
export default async function RetryMistakes({ searchParams }: { searchParams: SearchParams }) {
  if (!isSupabaseConfigured) return <SetupNotice />
  const [profile, { subject }] = await Promise.all([getCurrentProfile(), searchParams])
  const back = subject ? `/mistakes?subject=${subject}` : '/mistakes'
  const self = subject ? `/mistakes/practice?subject=${subject}` : '/mistakes/practice'
  if (!profile) redirect(`/?login=1&next=${encodeURIComponent(self)}`)

  const bank = (await getMistakeBank()).filter((m) => !subject || m.subjectSlug === subject)
  const due = [...bank.filter((m) => m.state === 'recap'), ...bank.filter((m) => m.state === 'open')].slice(0, SESSION)
  if (!due.length) redirect(back)

  const [loaded, solutions] = await Promise.all([
    getQuestionsWithAnswers(due.map((m) => m.questionId)),
    getSolutionsForSet(due.map((m) => m.questionId)),
  ])
  const meta = new Map(due.map((m) => [m.questionId, m]))

  // Numbered 1…n for the palette; the original paper and number go under each.
  const questions = loaded.map((question, index) => ({ ...question, number: index + 1 }))
  const sources = Object.fromEntries(
    loaded.flatMap((question) => {
      const m = meta.get(question.id)
      return m
        ? [[question.id, `From ${m.subjectName} · ${m.examName} · ${formatSession(m.session)} · Q${m.number}${m.state === 'recap' ? ' · recap' : ''}`]]
        : []
    }),
  )
  const subjectName = subject ? due[0]?.subjectName : null

  return (
    <ExamRunner
      setId="mistakes"
      mode="learning"
      questions={questions}
      solutions={solutions}
      isSignedIn
      review={{
        backHref: back,
        title: subjectName ? `Mistake bank · ${subjectName}` : 'Mistake bank',
        subtitle: `Retrying ${questions.length} ${questions.length === 1 ? 'mistake' : 'mistakes'} · each check is saved`,
        sources,
      }}
      meta={{
        examTypeName: 'Mistakes',
        subjectName: subjectName ?? 'Mistake bank',
        subjectSlug: subject ?? '',
        termLabel: null,
        sessionLabel: '',
        setCode: '',
        totalMarks: questions.reduce((sum, q) => sum + Number(q.marks), 0),
        durationMinutes: null,
      }}
    />
  )
}
