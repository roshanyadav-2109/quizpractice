import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getQuestionsWithAnswers } from '@/lib/queries'
import { gradeQuestion } from '@/lib/scoring'
import type { AnswerResponse } from '@/types/db'

/**
 * Marks one retried mistake and records it in the student's mistake bank.
 *
 * Marked here against the stored answer key, like a paper — the browser is
 * never trusted about whether its own answer was right.
 */

const bodySchema = z.object({
  questionId: z.string().uuid(),
  response: z
    .union([
      z.object({ option_ids: z.array(z.string()) }),
      z.object({ value: z.string() }),
      z.object({ text: z.string() }),
    ])
    .nullable(),
  timeSpentSeconds: z.number().int().min(0).max(86_400).optional(),
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
    return Response.json({ error: 'That answer was not in the expected shape.' }, { status: 400 })
  }
  const { questionId, response, timeSpentSeconds } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Sign in to keep a mistake bank.' }, { status: 401 })

  const [question] = await getQuestionsWithAnswers([questionId])
  if (!question) return Response.json({ error: 'That question does not exist.' }, { status: 404 })

  const result = gradeQuestion(question, response as AnswerResponse | null)
  if (!result.autoMarked || result.isCorrect === null) {
    return Response.json({ error: 'Written answers cannot be checked automatically.' }, { status: 422 })
  }

  const { error } = await supabase.from('question_reviews').insert({
    question_id: questionId,
    is_correct: result.isCorrect,
    response,
    time_spent_seconds: timeSpentSeconds ?? null,
  })
  if (error) return Response.json({ error: 'Could not save this retry.' }, { status: 500 })

  return Response.json({ result })
}
