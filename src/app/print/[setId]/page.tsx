import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getSetContext } from '@/lib/queries'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { PrintButton } from '@/components/site/PrintButton'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Printable worksheet',
  robots: { index: false },
}

type Params = Promise<{ setId: string }>
type SearchParams = Promise<{ answers?: string }>

/**
 * Printable worksheet.
 *
 * "Download as PDF" is the browser's own print-to-PDF against a print
 * stylesheet, rather than a PDF library — the layout stays a single source of
 * truth, the output has selectable text, and there is no second renderer to
 * keep in step with the block components.
 */
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  if (!isSupabaseConfigured) return <SetupNotice />

  const { setId } = await params
  const { answers } = await searchParams
  const withAnswers = answers === '1'

  const context = await getSetContext(setId, { includeAnswers: withAnswers })
  if (!context) notFound()

  const totalMarks = context.questions.reduce((sum, q) => sum + Number(q.marks), 0)

  return (
    <div className="mx-auto max-w-[55rem] px-5 py-6">
      <div className="no-print mb-6 flex flex-wrap items-center gap-2 border border-rule bg-surface p-3">
        <PrintButton />
        <Link
          href={`/print/${setId}${withAnswers ? '' : '?answers=1'}`}
          className="inline-flex h-8 items-center rounded-[3px] border border-rule px-3 text-[0.8125rem] text-ink-muted hover:border-rule-strong hover:text-ink"
        >
          {withAnswers ? 'Hide the answer key' : 'Include the answer key'}
        </Link>
        <Link
          href={`/practice/${setId}`}
          className="inline-flex h-8 items-center rounded-[3px] border border-rule px-3 text-[0.8125rem] text-ink-muted hover:border-rule-strong hover:text-ink"
        >
          Take it online instead
        </Link>
        <p className="w-full text-xs text-ink-muted">
          Print, then choose &ldquo;Save as PDF&rdquo; as the destination.
        </p>
      </div>

      <header className="border-b-2 border-current pb-4">
        <h1 className="text-xl font-medium">
          {context.subject.name} — {context.examType.name}
        </h1>
        <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <Meta label="Programme" value={context.program.short_name ?? context.program.name} />
          <Meta label="Set" value={context.set.set_code} />
          <Meta label="Date" value={context.paper.session_date ?? '—'} />
          <Meta label="Questions" value={String(context.questions.length)} />
          <Meta label="Total marks" value={String(context.paper.total_marks ?? totalMarks)} />
          {context.paper.duration_minutes ? (
            <Meta label="Duration" value={`${context.paper.duration_minutes} minutes`} />
          ) : null}
        </dl>
        {withAnswers ? (
          <p className="mt-3 text-sm">Answer key included</p>
        ) : null}
      </header>

      <ol className="mt-6 flex flex-col gap-7">
        {context.questions.map((question) => (
          <li key={question.id} className="print-question">
            <div className="flex items-baseline justify-between gap-4 border-b border-current/20 pb-1">
              <h2 className="font-medium">Question {question.number}</h2>
              <span className="font-mono text-xs">
                [{Number(question.marks)} mark{Number(question.marks) === 1 ? '' : 's'}]
                {' · '}
                {question.type.toUpperCase()}
              </span>
            </div>

            <div className="mt-3">
              <BlockRenderer blocks={question.body} />
            </div>

            {question.options.length > 0 ? (
              <ol className="mt-3 flex flex-col gap-1.5">
                {question.options.map((option) => (
                  <li key={option.id} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full border ${
                        withAnswers && option.is_correct
                          ? 'border-current bg-current'
                          : 'border-current/50'
                      }`}
                    />
                    <span className="w-5 shrink-0 font-mono text-sm">{option.label}</span>
                    <span className="min-w-0 flex-1">
                      <BlockRenderer blocks={option.content} context="option" />
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mt-3">
                <p className="text-xs opacity-60">Answer:</p>
                <div className="mt-1 h-16 border-b border-dashed border-current/40" />
              </div>
            )}

            {withAnswers && question.correct_answer ? (
              <p className="mt-2 text-sm">
                Answer: <span className="font-mono">{question.correct_answer}</span>
                {question.answer_tolerance ? ` (±${question.answer_tolerance})` : ''}
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      <footer className="mt-10 border-t border-current/20 pt-3 text-xs opacity-60">
        {context.subject.name} · {context.examType.name} · set {context.set.set_code} · an
        independent study resource, not affiliated with IIT Madras.
      </footer>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="opacity-60">{label}:</dt>
      <dd>{value}</dd>
    </div>
  )
}
