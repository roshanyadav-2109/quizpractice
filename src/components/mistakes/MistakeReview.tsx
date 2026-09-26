'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { AnswerInput } from '@/components/exam/AnswerInput'
import { SolutionPanel } from '@/components/question/SolutionPanel'
import { buttonClass } from '@/components/ui/primitives'
import { ArrowRight, CheckCircle, WarningCircle, X, XCircle } from '@/components/ui/icons'
import { isAnswered, type QuestionResult } from '@/lib/scoring'
import type { AnswerResponse, QuestionWithOptions, SolutionRow } from '@/types/db'

export interface ReviewItem {
  question: QuestionWithOptions
  label: string
  subject: string
}

/**
 * A retry session over the student's own mistakes: answer, check (marked on
 * the server and saved to the mistake bank), read the solution, move on.
 */
export function MistakeReview({
  items,
  solutions,
  backHref,
}: {
  items: ReviewItem[]
  solutions: Record<string, SolutionRow[]>
  backHref: string
}) {
  const [index, setIndex] = useState(0)
  const [response, setResponse] = useState<AnswerResponse | null>(null)
  const [result, setResult] = useState<QuestionResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcomes, setOutcomes] = useState<boolean[]>([])
  const started = useRef(0)

  const done = index >= items.length
  const item = items[index]

  async function check() {
    if (!item) return
    setBusy(true)
    setError(null)
    const spent = started.current ? Math.round((Date.now() - started.current) / 1000) : undefined
    try {
      const reply = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: item.question.id, response, timeSpentSeconds: spent }),
      })
      const body = (await reply.json()) as { result?: QuestionResult; error?: string }
      if (!reply.ok || !body.result) throw new Error(body.error ?? 'Could not check that answer.')
      setResult(body.result)
      setOutcomes((current) => [...current, Boolean(body.result?.isCorrect)])
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : 'Could not check that answer.')
    } finally {
      setBusy(false)
    }
  }

  function next() {
    setIndex((current) => current + 1)
    setResponse(null)
    setResult(null)
    setError(null)
    started.current = 0
    window.scrollTo({ top: 0 })
  }

  if (done) {
    const fixed = outcomes.filter(Boolean).length
    return (
      <div className="rounded-[10px] border border-rule bg-surface p-8 text-center">
        <p className="text-meta text-ink-faint">Session complete</p>
        <p className="mt-3 text-[2.5rem] leading-none font-light text-ink">
          {fixed} <span className="text-card text-ink-faint">of {outcomes.length} put right</span>
        </p>
        <p className="mx-auto mt-4 max-w-[46ch] text-ui font-light text-ink-muted">
          {fixed === outcomes.length
            ? 'Every one of them. Each comes back once in a few days to check it stuck.'
            : 'The ones you missed stay in your mistake bank for next time. The ones you got come back once in a few days to check they stuck.'}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Link href={backHref} className={buttonClass('primary', 'md')}>
            Back to mistake bank
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    )
  }

  const answered = isAnswered(response)

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="h-1.5 flex-1 bg-surface-3">
          <div className="h-full rounded-r-[4px] bg-accent transition-[width]" style={{ width: `${(index / items.length) * 100}%` }} />
        </div>
        <span className="shrink-0 text-meta text-ink-muted tabular-nums">
          {index + 1} of {items.length}
        </span>
        <Link href={backHref} aria-label="Stop retrying" className="flex h-9 w-9 items-center justify-center rounded-control text-ink-muted hover:bg-surface-2">
          <X size={18} />
        </Link>
      </div>

      <article className="mt-5 rounded-[10px] border border-rule bg-surface p-6 sm:p-8">
        <p className="text-meta text-ink-faint">
          <span className="text-ink-muted">{item.subject}</span> · {item.label}
        </p>
        <div className="paper mt-4 text-ink" onPointerDown={() => (started.current ||= Date.now())}>
          <BlockRenderer blocks={item.question.body} />
        </div>

        <div onPointerDown={() => (started.current ||= Date.now())}>
          <AnswerInput
            question={item.question}
            response={response}
            result={result}
            disabled={result !== null || busy}
            onChange={(value) => {
              started.current ||= Date.now()
              setResponse(value)
            }}
          />
        </div>

        {error ? (
          <p className="mt-4 flex items-center gap-2 text-meta text-incorrect">
            <WarningCircle size={16} />
            {error}
          </p>
        ) : null}

        {result ? (
          <>
            <div
              className={`mt-6 flex items-start gap-3 rounded-control px-4 py-3 ${
                result.isCorrect ? 'bg-correct-soft' : 'bg-incorrect-soft'
              }`}
            >
              {result.isCorrect ? (
                <CheckCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-correct" />
              ) : (
                <XCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-incorrect" />
              )}
              <p className="text-ui text-ink">
                {result.isCorrect
                  ? 'Right this time. It moves to fixed, and comes back once in a few days to check it stuck.'
                  : 'Not yet. It stays in your mistake bank; read the solution below first.'}
              </p>
            </div>
            <div className="mt-6">
              <SolutionPanel solutions={solutions[item.question.id] ?? []} />
            </div>
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={next} className={buttonClass('primary', 'md')}>
                {index === items.length - 1 ? 'Finish' : 'Next mistake'}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </>
        ) : (
          <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
            <button type="button" onClick={next} className={buttonClass('ghost', 'md')}>
              Skip for now
            </button>
            <button type="button" onClick={() => void check()} disabled={!answered || busy} className={buttonClass('primary', 'md')}>
              {busy ? 'Checking…' : 'Check answer'}
            </button>
          </div>
        )}
      </article>
    </div>
  )
}
