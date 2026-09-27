import Link from 'next/link'
import { QuestionWithAnswer } from '@/components/question/QuestionWithAnswer'
import type { QuestionWithOptions } from '@/types/db'

export interface CopyLink {
  label: string
  href: string
}

/**
 * One question of a paper's free preview: the question as it was printed,
 * with its options, and where else IIT Madras asked it. Its answer is not
 * here — answers, explanations and the rest of the paper open after a
 * Google sign-in (src/lib/access.ts).
 */
export function PaperQuestion({ question, copies }: { question: QuestionWithOptions; copies: CopyLink[] }) {
  return (
    <section id={`q${question.number}`} className="scroll-mt-20 rounded-card border border-rule bg-surface px-5 py-5 sm:px-6">
      <QuestionWithAnswer question={question} showAnswer={false} />

      {copies.length > 0 ? (
        <p className="mt-3 text-meta text-ink-muted">
          Also asked in{' '}
          {copies.slice(0, 4).map((copy, index) => (
            <span key={copy.href}>
              {index > 0 ? ', ' : ''}
              <Link href={copy.href} className="hover:text-ink hover:underline">
                {copy.label}
              </Link>
            </span>
          ))}
          {copies.length > 4 ? ` and ${copies.length - 4} more` : ''}
        </p>
      ) : null}
    </section>
  )
}
