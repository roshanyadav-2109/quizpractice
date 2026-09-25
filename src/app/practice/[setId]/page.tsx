import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getSetContext, getSetOverview, getSolutionsForSetId } from '@/lib/queries'
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
  const context = await getSetOverview(setId)
  if (!context) return { title: 'Paper not found' }

  return {
    title: `${context.subject.name} ${context.examType.name} — practice`,
    description: `Practise the ${context.subject.name} ${context.examType.name} paper from ${context.paper.session_date ?? 'a previous term'} with ${context.questions.length} questions and worked solutions.`,
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
  // The profile and the explanations do not depend on the set's contents, so
  // they travel with it rather than each costing a round trip after it lands.
  const [context, profile, solutions] = await Promise.all([
    getSetContext(setId, { includeAnswers: mode === 'learning' }),
    getCurrentProfile(),
    mode === 'learning' ? getSolutionsForSetId(setId) : Promise.resolve({}),
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
        solutions={solutions}
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
