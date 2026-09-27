import { notFound, permanentRedirect } from 'next/navigation'
import { findPaper } from '@/lib/seo/catalogue'
import { questionNumberFromSlug } from '@/lib/seo/paths'
import { LEAD_IN } from '@/lib/access'

/**
 * The old address of one question: /pyq/maths-1/quiz-1/16-feb-2025/q12-….
 *
 * Questions no longer have public pages of their own: a paper shows its
 * first questions to anyone and the rest after a Google sign-in. So every
 * old question address sends its visitor — and search engines, which were
 * given these addresses in September 2026 — to its paper, permanently: the
 * address passes on what it earned, and drops out of search. A question in
 * the free preview lands on itself.
 */
export const revalidate = 86400

type Params = Promise<{ subject: string; exam: string; paper: string; question: string }>

export async function generateStaticParams() {
  return []
}

export default async function OldQuestionPage({ params }: { params: Params }) {
  const { subject, exam, paper: slug, question } = await params
  const number = questionNumberFromSlug(question)
  const paper = await findPaper(subject, exam, slug)
  if (!paper || number === null) notFound()
  permanentRedirect(number <= LEAD_IN ? `${paper.path}#q${number}` : paper.path)
}
