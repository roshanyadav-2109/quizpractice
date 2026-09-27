import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { CheckCircle, Warning } from '@/components/ui/icons'
import type { QuestionOptionRow, QuestionWithOptions } from '@/types/db'

/** What the card needs of a question: everything a teacher explains from, nothing else. */
export type QuestionWithAnswerData = Pick<
  QuestionWithOptions,
  'number' | 'type' | 'marks' | 'negative_marks' | 'body' | 'correct_answer' | 'answer_tolerance'
> & { options: Pick<QuestionOptionRow, 'id' | 'label' | 'content' | 'is_correct'>[] }

const TYPE_LABELS: Record<QuestionWithAnswerData['type'], string> = {
  mcq: 'One correct option',
  msq: 'One or more correct options',
  numerical: 'Numerical answer',
  subjective: 'Written answer',
  programming: 'Programming',
}

/**
 * A question with its answer key: the full body (text, maths, code, tables,
 * figures), every option in the order this paper prints them with the
 * correct ones filled in, and for a typed answer the value with its
 * tolerance — plus the marks.
 *
 * It is what a teacher explains from, so it is shown whole, beside the
 * board, and photographed for the question card on the recording. The
 * markup follows the printable worksheet this site used to have, in the
 * site's own colours.
 *
 * `hideLabels` drops the option letters: when copies of the question print
 * their options in a different order, a letter on the video would name the
 * wrong option on some of them.
 *
 * No hooks, so it renders on the server and in the browser alike.
 */
export function QuestionWithAnswer({
  question,
  showAnswer = true,
  hideLabels = false,
  className = '',
}: {
  question: QuestionWithAnswerData
  showAnswer?: boolean
  hideLabels?: boolean
  className?: string
}) {
  const marks = Number(question.marks)
  const negative = Number(question.negative_marks)
  const choice = question.type === 'mcq' || question.type === 'msq'
  const anyCorrect = question.options.some((option) => option.is_correct)

  return (
    <article className={`text-ink ${className}`} aria-label={`Question ${question.number}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-2">
        <h2 className="shrink-0 text-card font-medium whitespace-nowrap text-ink tabular-nums">Question {question.number}</h2>
        <span className="flex flex-wrap items-center gap-2 text-meta">
          <span className="rounded-md bg-correct-soft px-2 py-0.5 whitespace-nowrap text-correct tabular-nums">
            +{marks} mark{marks === 1 ? '' : 's'}
          </span>
          {negative > 0 ? (
            <span className="rounded-md bg-incorrect-soft px-2 py-0.5 whitespace-nowrap text-incorrect tabular-nums">−{negative} if wrong</span>
          ) : null}
          <span className="whitespace-nowrap text-ink-faint">{TYPE_LABELS[question.type]}</span>
        </span>
      </div>

      <div className="mt-3">
        <BlockRenderer blocks={question.body} />
      </div>

      {question.options.length > 0 ? (
        <>
          {question.type === 'msq' ? <p className="mt-3 text-meta text-ink-faint">Select all that apply.</p> : null}
          <ol className="mt-3 flex flex-col gap-2">
            {question.options.map((option) => {
              const correct = showAnswer && option.is_correct
              return (
                <li
                  key={option.id}
                  className={`flex items-start gap-3 rounded-control border px-3 py-2.5 ${
                    correct ? 'border-correct bg-correct-soft' : 'border-rule bg-surface'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-[0.3rem] h-3.5 w-3.5 shrink-0 border ${
                      question.type === 'msq' ? 'rounded-[3px]' : 'rounded-full'
                    } ${correct ? 'border-correct bg-correct' : 'border-rule-strong bg-surface'}`}
                  />
                  {hideLabels ? null : (
                    <span className="w-5 shrink-0 text-meta font-medium text-ink-muted tabular-nums">{option.label}</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <BlockRenderer blocks={option.content} context="option" />
                  </span>
                  {correct ? (
                    <span className="flex shrink-0 items-center gap-1 text-meta text-correct">
                      <CheckCircle size={18} weight="fill" aria-hidden="true" />
                      Correct
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </>
      ) : null}

      {showAnswer ? (
        question.correct_answer && !choice ? (
          <p className="mt-3 rounded-control border border-correct bg-correct-soft px-3 py-2.5 text-ui text-correct">
            Answer: <span className="font-medium tabular-nums">{question.correct_answer}</span>
            {/* Numeric columns can arrive as strings ("0"), so compare the number. */}
            {Number(question.answer_tolerance) > 0 ? (
              <span className="tabular-nums"> (±{Number(question.answer_tolerance)})</span>
            ) : null}
          </p>
        ) : (choice && !anyCorrect) || (!choice && !question.correct_answer) ? (
          <p className="mt-3 flex items-start gap-2 rounded-control bg-marked-soft px-3 py-2.5 text-meta text-marked">
            <Warning size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            {choice
              ? 'No option is marked correct in the answer key.'
              : 'No answer is recorded for this question.'}
          </p>
        ) : null
      ) : null}
    </article>
  )
}
