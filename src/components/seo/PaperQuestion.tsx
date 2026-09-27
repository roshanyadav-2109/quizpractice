import Link from 'next/link'
import { QuestionWithAnswer } from '@/components/question/QuestionWithAnswer'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { CheckCircle, Play } from '@/components/ui/icons'
import type { QuestionWithOptions } from '@/types/db'

export interface CopyLink {
  label: string
  href: string
}

/**
 * One question of a paper page: the question as it was printed, then its
 * answer behind a "Show answer" fold — in the page for search engines and
 * assistants, out of sight for a student who wants to try it first — then
 * where else IIT Madras asked it and a link to its own page.
 */
export function PaperQuestion({
  question,
  href,
  copies,
  hasVideo = false,
}: {
  question: QuestionWithOptions
  /** The question's own page. */
  href: string
  copies: CopyLink[]
  /** A video solution plays on the question's own page. */
  hasVideo?: boolean
}) {
  return (
    <section id={`q${question.number}`} className="scroll-mt-20 rounded-card border border-rule bg-surface px-5 py-5 sm:px-6">
      <QuestionWithAnswer question={question} showAnswer={false} />
      <AnswerFold question={question} />

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ink-muted">
        {hasVideo ? (
          <Link
            href={`${href}#video-solution`}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-0.5 text-accent hover:underline"
          >
            <Play size={12} weight="fill" aria-hidden="true" />
            Video solution
            <span className="sr-only"> for question {question.number}</span>
          </Link>
        ) : null}
        <Link href={href} className="hover:text-ink hover:underline">
          Question {question.number} on its own page
        </Link>
        {copies.length > 0 ? (
          <span>
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
          </span>
        ) : null}
      </div>
    </section>
  )
}

/**
 * The answer, folded: the correct options drawn exactly as the question
 * draws them — maths, code and figures included — or the numerical value
 * with its tolerance.
 */
export function AnswerFold({ question, open = false }: { question: QuestionWithOptions; open?: boolean }) {
  const choice = question.type === 'mcq' || question.type === 'msq'
  const correct = choice ? question.options.filter((option) => option.is_correct) : []
  const tolerance = Number(question.answer_tolerance)
  const value = !choice && question.correct_answer ? question.correct_answer : null

  return (
    <details open={open} className="group mt-4 rounded-control border border-rule">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-ui text-ink select-none">
        <span>Show answer</span>
        <span aria-hidden className="text-meta text-ink-faint group-open:hidden">Tap to reveal</span>
      </summary>
      <div className="border-t border-rule px-4 py-3 text-ui">
        {correct.length > 0 ? (
          <div className="flex items-start gap-2">
            <CheckCircle size={18} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0 text-correct" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-correct">{correct.length > 1 ? 'Correct answers' : 'Correct answer'}</p>
              <ul className="mt-1.5 flex flex-col gap-2">
                {correct.map((option) => (
                  <li key={option.id} className="flex items-start gap-3">
                    <span className="w-5 shrink-0 text-meta font-medium text-ink-muted tabular-nums">{option.label}</span>
                    <span className="min-w-0 flex-1">
                      <BlockRenderer blocks={option.content} context="option" />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : value ? (
          <p className="flex items-start gap-2 text-correct">
            <CheckCircle size={18} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              <span className="font-medium">Correct answer: </span>
              <span className="tabular-nums">{value}</span>
              {tolerance > 0 ? <span className="tabular-nums"> (accepted within ±{tolerance})</span> : null}
            </span>
          </p>
        ) : (
          <p className="text-ink-muted">
            {question.type === 'subjective' || question.type === 'programming'
              ? 'A written answer, not marked automatically.'
              : 'The answer key for this question was not published.'}
          </p>
        )}
      </div>
    </details>
  )
}
