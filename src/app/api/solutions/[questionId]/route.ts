import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSolutionsForQuestion } from '@/lib/queries'

/**
 * One question's explanations, asked for only when a student opens its
 * answer. Approved explanations are public, so the response is cached by the
 * CDN as well as the browser: a popular question is answered without reaching
 * the server at all.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const { questionId } = await params
  if (!z.string().uuid().safeParse(questionId).success) {
    return NextResponse.json({ error: 'Not a question id.' }, { status: 400 })
  }

  try {
    const solutions = await getSolutionsForQuestion(questionId)
    return NextResponse.json(
      { solutions },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400' } },
    )
  } catch {
    return NextResponse.json({ error: 'Could not load the explanation.' }, { status: 502 })
  }
}
