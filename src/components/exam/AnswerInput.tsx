'use client'

import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import type { AnswerResponse, QuestionWithOptions } from '@/types/db'
import type { QuestionResult } from '@/lib/scoring'
import { responseValue, selectedOptionIds } from '@/lib/scoring'
import { CheckCircle, XCircle } from '@/components/ui/icons'

/**
 * The input for one question, matched to its type. A numerical answer needs a
 * number field and a programming answer needs somewhere to actually write code;
 * rendering everything as radio buttons is the shortcut this avoids.
 */
export function AnswerInput({
  question,
  response,
  result,
  disabled,
  onChange,
}: {
  question: QuestionWithOptions
  response: AnswerResponse | null
  result: QuestionResult | null
  disabled: boolean
  onChange: (response: AnswerResponse) => void
}) {
  if (question.type === 'mcq' || question.type === 'msq') {
    return (
      <ChoiceInput
        question={question}
        response={response}
        result={result}
        disabled={disabled}
        onChange={onChange}
      />
    )
  }

  if (question.type === 'numerical') {
    const value = responseValue(response) ?? ''
    const judged = result !== null && result.isCorrect !== null
    return (
      <div className="mt-5">
        <label className="flex flex-col gap-2">
          <span className="text-meta text-ink-muted">Your answer</span>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            disabled={disabled}
            onChange={(event) => onChange({ value: event.target.value })}
            placeholder="Enter a number"
            className={`h-12 w-full max-w-xs rounded-control border bg-surface px-4 text-body text-ink tabular-nums transition-colors outline-none placeholder:text-ink-faint disabled:opacity-75 ${
              judged
                ? result.isCorrect
                  ? 'border-correct'
                  : 'border-incorrect'
                : 'border-rule-strong focus:border-ink'
            }`}
          />
        </label>
        {result && result.isCorrect !== true && result.correctAnswer !== null ? (
          <p className="mt-2 text-ui text-correct tabular-nums">
            Correct answer: {result.correctAnswer}
            {question.answer_tolerance ? (
              <span className="text-ink-muted"> (±{question.answer_tolerance})</span>
            ) : null}
          </p>
        ) : null}
      </div>
    )
  }

  const text = responseValue(response) ?? ''
  const code = question.type === 'programming'
  return (
    <div className="mt-5">
      <label className="flex flex-col gap-2">
        <span className="text-meta text-ink-muted">
          {code ? 'Your code' : 'Your answer'}
        </span>
        <textarea
          value={text}
          disabled={disabled}
          rows={code ? 10 : 5}
          spellCheck={!code}
          onChange={(event) => onChange({ text: event.target.value })}
          className={`w-full rounded-control border border-rule-strong bg-surface px-4 py-3 text-ink transition-colors outline-none focus:border-ink disabled:opacity-75 ${
            code ? 'font-mono text-[0.875rem] leading-relaxed' : 'text-body'
          }`}
        />
      </label>
      <p className="mt-2 text-meta text-ink-faint">
        Written answers are not marked automatically — compare yours with the solution.
      </p>
    </div>
  )
}

function ChoiceInput({
  question,
  response,
  result,
  disabled,
  onChange,
}: {
  question: QuestionWithOptions
  response: AnswerResponse | null
  result: QuestionResult | null
  disabled: boolean
  onChange: (response: AnswerResponse) => void
}) {
  const selected = new Set(selectedOptionIds(response))
  const multiple = question.type === 'msq'
  const correctIds = new Set(result?.correctOptionIds ?? [])
  const showsResult = result !== null

  function toggle(optionId: string) {
    if (disabled) return
    if (!multiple) {
      onChange({ option_ids: [optionId] })
      return
    }
    const next = new Set(selected)
    if (next.has(optionId)) next.delete(optionId)
    else next.add(optionId)
    onChange({ option_ids: [...next] })
  }

  return (
    <fieldset className="mt-5">
      <legend className="sr-only">{multiple ? 'Select all that apply' : 'Select one option'}</legend>
      {multiple ? <p className="mb-3 text-meta text-ink-muted">Select all that apply.</p> : null}

      <ul className="flex flex-col gap-2.5">
        {question.options.map((option) => {
          const isSelected = selected.has(option.id)
          const isCorrect = correctIds.has(option.id)
          const wrongPick = showsResult && isSelected && !isCorrect

          // Before marking: grey rows, the chosen one blue. After: the key is
          // shown whatever was picked, and a wrong pick is marked as wrong.
          const tone = !showsResult
            ? isSelected
              ? 'border-pal-answered bg-accent-soft'
              : 'border-transparent bg-surface-2 hover:bg-surface-3'
            : isCorrect
              ? 'border-correct bg-correct-soft'
              : wrongPick
                ? 'border-incorrect bg-incorrect-soft'
                : 'border-transparent bg-surface-2'

          return (
            <li key={option.id}>
              <label
                className={`flex items-start gap-3.5 rounded-control border px-4 py-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${tone} ${
                  disabled ? 'cursor-default' : 'cursor-pointer'
                }`}
              >
                <input
                  type={multiple ? 'checkbox' : 'radio'}
                  name={`question-${question.id}`}
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => toggle(option.id)}
                  className="mt-[5px] h-[1.125rem] w-[1.125rem] shrink-0 accent-pal-answered focus-visible:outline-none"
                />
                <span className="mt-px shrink-0 text-ui text-ink-faint">{option.label}.</span>
                <span className="paper min-w-0 flex-1 text-ink">
                  <BlockRenderer blocks={option.content} context="option" />
                </span>

                {showsResult && isCorrect ? (
                  <CheckCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-correct">
                    <title>Correct answer</title>
                  </CheckCircle>
                ) : wrongPick ? (
                  <XCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-incorrect">
                    <title>Your answer</title>
                  </XCircle>
                ) : null}
              </label>
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}
