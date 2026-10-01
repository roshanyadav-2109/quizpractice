import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { paperPathForSet } from '@/lib/seo/catalogue'
import { absolute } from '@/lib/seo/site'
import type { Metadata } from 'next'
import { getSetContext, getSetOverview } from '@/lib/queries'
import { getCurrentProfile } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'
import { SHELL } from '@/components/site/Page'
import { EmptyState } from '@/components/ui/EmptyState'
import { buttonClass } from '@/components/ui/primitives'
import { leadIn, openSet, recordSignal, refusal } from '@/lib/access'
import { watermark } from '@/lib/watermark'
import { ExamRunner } from '@/components/exam/ExamRunner'
import { PaperBeacon } from '@/components/exam/PaperBeacon'
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

  // Picking and typing answers is open to everyone. The timed exam, and
  // seeing an answer, ask for a Google sign-in: the attempt is saved and marked.
  // A visitor sent to the exam lands in learning mode with the sign-in card
  // open, and comes back to the exam once signed in.
  const profile = await getCurrentProfile()
  if (mode === 'exam' && !profile) {
    redirect(`/practice/${setId}?mode=learning&login=1&next=${encodeURIComponent(`/practice/${setId}`)}`)
  }

  // Exam mode never asks the database for is_correct, and learning mode only
  // for someone signed in, so the answer key is not in the page payload until
  // a student may see it.
  //
  // Explanations are not loaded here: each is fetched when its answer is
  // opened, so a paper does not bring every explanation with it.
  const context = await getSetContext(setId, { includeAnswers: mode === 'learning' && Boolean(profile) })
  if (!context) notFound()

  // Signed out: the paper's first questions, as on its page, and the rest
  // behind a sign-in. Signed in: the whole paper — recorded, limited per
  // account, and marked with the account (src/lib/access.ts).
  let questions = context.questions
  if (!profile) {
    questions = leadIn(context.questions)
  } else {
    const opened = await openSet(setId)
    if (!opened.allowed) {
      await recordSignal({ kind: 'limit', userId: profile.id, setId, path: `/practice/${setId}` })
      return <SlowDown {...refusal(opened)} />
    }
    questions = watermark(context.questions, profile.id)
  }

  const totalMarks = context.questions.reduce(
    (sum, question) => sum + Number(question.marks),
    0,
  )

  return (
    <>
      {profile ? <PaperBeacon setId={setId} /> : null}
      <ExamRunner
        setId={setId}
        mode={mode}
        questions={questions}
        locked={profile ? undefined : { total: context.questions.length }}
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
        {questions
          .slice(0, 3)
          .map((question) => blocksToText(question.body))
          .join(' ')}
      </p>
    </>
  )
}

/** An account over the paper limit, opening papers too fast, or on a blocked network: the same screen for a student in a hurry and a copier. */
function SlowDown({ title, message }: { title: string; message: string }) {
  return (
    <div className={`${SHELL} py-12`}>
      <EmptyState
        art="waiting-for-others"
        size="lg"
        title={title}
        actions={
          <Link href="/dashboard" className={buttonClass('primary', 'md')}>
            Back to your dashboard
          </Link>
        }
      >
        {message}
      </EmptyState>
    </div>
  )
}
