import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { setExtractionStatus } from '@/app/admin/actions'
import { ActionButton } from '@/components/admin/ActionButton'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { ExtractionStatus } from '@/types/db'
import { EmptyState } from '@/components/ui/EmptyState'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ status?: string }>

interface ExtractionRecord {
  id: string
  source_public_id: string | null
  confidence: number | null
  extracted_by: string | null
  status: ExtractionStatus
  notes: string | null
  created_at: string
  raw_output: unknown
  question_papers: {
    id: string
    session_date: string | null
    subjects: { name: string } | null
    exam_types: { name: string } | null
  } | null
}

/**
 * The review queue.
 *
 * Sorted by confidence ascending on purpose: the worst transcriptions get human
 * eyes first, which is what makes reviewing thousands of extracted questions
 * tractable. Nothing here is published by being extracted — a question reaches
 * students only once someone has looked at it.
 */
export default async function AdminReviewPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { status = 'pending' } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('extractions')
    .select(
      'id, source_public_id, confidence, extracted_by, status, notes, created_at, raw_output, question_papers(id, session_date, subjects(name), exam_types(name))',
    )
    .order('confidence', { ascending: true, nullsFirst: true })
    .limit(100)

  if (status !== 'all') query = query.eq('status', status)

  const { data } = await query
  const extractions = (data ?? []) as unknown as ExtractionRecord[]

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-ink">Extraction review</h2>
          <p className="text-[0.78125rem] text-ink-muted">Lowest confidence first.</p>
        </div>
        <div className="flex gap-1.5">
          {['pending', 'in_review', 'approved', 'rejected', 'all'].map((value) => (
            <Link
              key={value}
              href={`/admin/review?status=${value}`}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                status === value
                  ? 'bg-accent text-accent-ink'
                  : 'border border-rule text-ink-muted hover:border-rule-strong hover:text-ink'
              }`}
            >
              {value.replace('_', ' ')}
            </Link>
          ))}
        </div>
      </div>

      {extractions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-rule px-4 py-12 text-center">
          <EmptyState framed={false} size="sm" art="all-clear" title="Nothing in this queue" />
          <p className="mt-2 text-xs text-ink-faint">
            Extractions land here when you run{' '}
            <code className="font-mono">npm run paper:extract</code> and import the result.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {extractions.map((extraction) => {
            const paper = extraction.question_papers
            const confidence = extraction.confidence === null ? null : Number(extraction.confidence)
            const low = confidence !== null && confidence < 0.8

            return (
              <li key={extraction.id} className="rounded-lg border border-rule bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-ink">
                      {paper?.subjects?.name ?? 'Unknown subject'}
                      <span className="ml-2 font-normal text-ink-muted">
                        {paper?.exam_types?.name} {paper?.session_date ?? ''}
                      </span>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                      <span
                        className={`font-mono tabular-nums ${low ? 'text-marked' : 'text-correct'}`}
                      >
                        confidence {confidence === null ? '—' : confidence.toFixed(2)}
                      </span>
                      {extraction.extracted_by ? (
                        <span className="font-mono">{extraction.extracted_by}</span>
                      ) : null}
                      <span>{new Date(extraction.created_at).toLocaleDateString('en-GB')}</span>
                    </p>
                    {extraction.notes ? (
                      <p className="mt-2 rounded-md bg-marked-soft px-2.5 py-1.5 text-xs whitespace-pre-wrap text-marked">
                        {extraction.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {paper ? (
                      <Link
                        href={`/admin/papers/${paper.id}`}
                        className="rounded-md border border-rule px-2.5 py-1.5 text-xs text-ink-muted hover:border-rule-strong hover:text-ink"
                      >
                        Open the paper
                      </Link>
                    ) : null}
                    {extraction.status !== 'approved' ? (
                      <ActionButton
                        label="Mark reviewed"
                        tone="positive"
                        action={async () => {
                          'use server'
                          return setExtractionStatus(extraction.id, 'approved')
                        }}
                      />
                    ) : null}
                    {extraction.status !== 'rejected' ? (
                      <ActionButton
                        label="Reject"
                        tone="danger"
                        action={async () => {
                          'use server'
                          return setExtractionStatus(extraction.id, 'rejected')
                        }}
                      />
                    ) : null}
                  </div>
                </div>

                {extraction.source_public_id ? (
                  <details className="mt-3 border-t border-rule pt-3">
                    <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink">
                      Original scan
                    </summary>
                    <div className="mt-2 overflow-x-auto rounded-md border border-rule bg-white p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary
                          already optimises and serves this; next/image adds nothing. */}
                      <img
                        src={cloudinaryUrl(
                          { public_id: extraction.source_public_id },
                          { width: 900 },
                        )}
                        alt="Original scanned question"
                        loading="lazy"
                        className="mx-auto h-auto max-w-full"
                      />
                    </div>
                  </details>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
