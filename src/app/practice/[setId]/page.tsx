import { notFound } from 'next/navigation'
import { paperPathForSet } from '@/lib/seo/catalogue'
import { absolute } from '@/lib/seo/site'
import type { Metadata } from 'next'
import { getSetContext, getSetOverview } from '@/lib/queries'
import { getCurrentProfile } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'
import { ExamRunner } from '@/components/exam/ExamRunner'
import { blocksToText } from '@/lib/blocks/schema'
import { formatSession } from '@/lib/format'
import { termOf } from '@/lib/terms'

export const dynamic = 'force-dynamic'

type Params = Promise<{ setId: string }>
type SearchParams = Promise<{ mode?: string; q?: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  if (!isSupabaseConfigured) return { title: 'Practice' }
  const { setId } = await params
  const [context, readerPath] = await Promise.all([getSetOverview(setId), paperPathForSet(setId)])
  if (!context) return { title: 'Paper not found', robots: { index: false } }

  // The exam runner is a mode, not a page: its content is the paper's, and
  // the paper's own page is the one to rank.
  return {
    title: `${context.subject.name} ${context.examType.name} — mock test`,
    description: `Take the ${context.subject.name} ${context.examType.name} paper from ${context.paper.session_date ?? 'a previous term'} as a timed mock test: ${context.questions.length} questions, marked when you submit.`,
    ...(readerPath ? { alternates: { canonical: absolute(readerPath) } } : {}),
  }
}

export default async function PracticePage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  if (!isSupabaseConfigured) return <SetupNotice />

  const { setId } = await params
  const { mode: rawMode, q } = await searchParams
  const mode = rawMode === 'learning' ? 'learning' : 'exam'

  // Exam mode never asks the database for is_correct, so the answer key is
  // simply not in the page payload while a student is working through it.
  //
  // Explanations are not loaded here: each is fetched when its answer is
  // opened, so a paper does not bring every explanation with it.
  const [context, profile] = await Promise.all([
    getSetContext(setId, { includeAnswers: mode === 'learning' }),
    getCurrentProfile(),
  ])
  if (!context) notFound()

  const totalMarks = context.questions.reduce(
    (sum, question) => sum + Number(question.marks),
    0,
  )

  return (
    <>
      <ExamRunner
        setId={setId}
        mode={mode}
        questions={context.questions}
        isSignedIn={Boolean(profile)}
        startAt={q ? Number(q) : undefined}
        meta={{
          examTypeName: context.examType.name,
          subjectName: context.subject.name,
          subjectSlug: context.subject.slug,
          termLabel: termOf(context.paper.session_date)?.label ?? null,
          sessionLabel: formatSession(context.paper.session_date),
          setCode: context.set.set_code,
          totalMarks: Number(context.paper.total_marks ?? totalMarks),
          durationMinutes:
            context.paper.duration_minutes ?? context.examType.default_duration_minutes,
        }}
      />

      {/* A plain-text rendering of the first question, so search engines and
          link previews see the actual content rather than an empty shell. */}
      <p className="sr-only">
        {context.questions
          .slice(0, 3)
          .map((question) => blocksToText(question.body))
          .join(' ')}
      </p>
    </>
  )
}
