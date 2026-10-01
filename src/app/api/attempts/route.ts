import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { TAG, refresh } from '@/lib/cache'
import { getSetContext } from '@/lib/queries'
import { openSet, recordSignal, refusal } from '@/lib/access'
import { gradeAttempt } from '@/lib/scoring'
import type { AnswerResponse } from '@/types/db'

/**
 * Marks a submitted paper.
 *
 * Marking happens here, against the answer key read from the database, rather
 * than in the browser — the client is never trusted with which options are
 * correct during an exam-mode attempt, and never trusted about its own score.
 *
 * Signing in is optional: an anonymous attempt is marked and returned, it is
 * just not saved.
 */

const responseSchema = z.union([
  z.object({ option_ids: z.array(z.string()) }),
  z.object({ value: z.string() }),
  z.object({ text: z.string() }),
])

const bodySchema = z.object({
  setId: z.string().uuid(),
  mode: z.enum(['exam', 'learning']).default('exam'),
  responses: z.record(z.string(), responseSchema).default({}),
  durationSeconds: z.number().int().min(0).max(86_400).optional(),
  /** Seconds spent on each question, keyed by question id. */
  timings: z.record(z.string(), z.number().int().min(0).max(86_400)).optional(),
})

export async function POST(request: NextRequest) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(payload)
  if (!parsed.success) {
    return Response.json(
      { error: 'That submission was not in the expected shape.' },
      { status: 400 },
    )
  }

  const { setId, mode, responses, durationSeconds, timings } = parsed.data

  // Marking says which answers were right, so it is for signed-in students
  // only, and each paper marked counts towards the account's paper limit —
  // otherwise the answer key could be found by submitting guesses.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Sign in with Google to submit and see your marks.' }, { status: 401 })
  }
  const opened = await openSet(setId)
  if (!opened.allowed) {
    await recordSignal({ kind: 'limit', userId: user.id, setId, path: '/api/attempts' })
    const why = refusal(opened)
    return Response.json(
      { error: why.message },
      { status: why.status, headers: opened.retryAfter > 0 ? { 'Retry-After': String(opened.retryAfter) } : undefined },
    )
  }

  const context = await getSetContext(setId, { includeAnswers: true })
  if (!context) {
    return Response.json({ error: 'That question set does not exist.' }, { status: 404 })
  }

  const graded = gradeAttempt(
    context.questions,
    responses as Record<string, AnswerResponse>,
  )

  const { data: attempt, error: attemptError } = await supabase
    .from('attempts')
    .insert({
      user_id: user.id,
      set_id: setId,
      mode,
      submitted_at: new Date().toISOString(),
      score: graded.score,
      max_score: graded.maxScore,
      duration_seconds: durationSeconds ?? null,
    })
    .select('id')
    .single()

  if (attemptError || !attempt) {
    // The marking itself succeeded, so return it rather than failing the whole
    // request over a storage problem.
    return Response.json({ saved: false, ...graded })
  }

  const answerRows = context.questions.map((question) => {
    const result = graded.results.find((r) => r.questionId === question.id)
    return {
      attempt_id: attempt.id as string,
      question_id: question.id,
      response: responses[question.id] ?? null,
      is_correct: result?.autoMarked ? result.isCorrect : null,
      marks_awarded: result?.marksAwarded ?? 0,
      time_spent_seconds: timings?.[question.id] ?? null,
    }
  })

  await supabase.from('attempt_answers').insert(answerRows)
  // Their dashboard, mistakes and rankings change with this attempt.
  refresh(TAG.user(user.id))

  return Response.json({ saved: true, attemptId: attempt.id, ...graded })
}
