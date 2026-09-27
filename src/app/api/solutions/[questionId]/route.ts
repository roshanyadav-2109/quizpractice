import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSolutionsForQuestion } from '@/lib/queries'
import { getCurrentProfile } from '@/lib/supabase/server'
import { mayReadQuestion } from '@/lib/access'

/**
 * One question's explanations, asked for only when a signed-in student opens
 * its answer — for a paper they have opened, or a question they have answered
 * (may_read_question, 0034). Without that check the explanations could be
 * walked question by question, so the answer is private to the student and
 * never held by the CDN.
 *
 * The server's own copy is dropped at once when an explanation changes
 * (TAG.solutions); the browser may keep its copy for a minute.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const { questionId } = await params
  if (!z.string().uuid().safeParse(questionId).success) {
    return NextResponse.json({ error: 'Not a question id.' }, { status: 400 })
  }

  const profile = await getCurrentProfile()
  if (!profile) return NextResponse.json({ error: 'Sign in with Google to see the explanation.' }, { status: 401 })
  if (!(await mayReadQuestion(questionId))) {
    return NextResponse.json({ error: 'Open this question’s paper to see its explanation.' }, { status: 403 })
  }

  try {
    const solutions = await getSolutionsForQuestion(questionId)
    return NextResponse.json({ solutions }, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch {
    return NextResponse.json({ error: 'Could not load the explanation.' }, { status: 502 })
  }
}
