import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { resolveReport } from '@/app/admin/actions'
import { ActionButton } from '@/components/admin/ActionButton'
import { blocksToText, parseBlocks } from '@/lib/blocks/schema'
import type { ReportKind, ReportStatus } from '@/types/db'
import { EmptyState } from '@/components/ui/EmptyState'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ status?: string }>

interface ReportRecord {
  id: string
  kind: ReportKind
  description: string
  status: ReportStatus
  created_at: string
  question_id: string
  questions: {
    id: string
    number: number
    body: unknown
    set_id: string
  } | null
  profiles: { display_name: string | null } | null
}

const KIND_LABELS: Record<ReportKind, string> = {
  correction: 'Question text is wrong',
  wrong_answer: 'Marked answer is wrong',
  broken_format: 'Renders incorrectly',
  other: 'Other',
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { status = 'open' } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('reports')
    .select(
      'id, kind, description, status, created_at, question_id, questions(id, number, body, set_id), profiles(display_name)',
    )
    .order('created_at', { ascending: false })
    .limit(200)

  if (status !== 'all') query = query.eq('status', status)

  const { data } = await query
  const reports = (data ?? []) as unknown as ReportRecord[]

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-ink">Reports</h2>

        </div>
        <div className="flex gap-1.5">
          {['open', 'resolved', 'dismissed', 'all'].map((value) => (
            <Link
              key={value}
              href={`/admin/reports?status=${value}`}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                status === value
                  ? 'bg-accent text-accent-ink'
                  : 'border border-rule text-ink-muted hover:border-rule-strong hover:text-ink'
              }`}
            >
              {value}
            </Link>
          ))}
        </div>
      </div>

      {reports.length === 0 ? (
        <EmptyState size="sm" art="all-clear" title="Nothing in this queue">
          All caught up.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((report) => (
            <li key={report.id} className="rounded-lg border border-rule bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink">{KIND_LABELS[report.kind]}</p>
                  <p className="mt-1 text-sm whitespace-pre-wrap text-ink-muted">
                    {report.description}
                  </p>
                  <p className="mt-2 text-xs text-ink-faint">
                    {report.profiles?.display_name ?? 'Anonymous'} ·{' '}
                    {new Date(report.created_at).toLocaleDateString('en-GB')}
                  </p>
                </div>

                {report.status === 'open' ? (
                  <div className="flex shrink-0 gap-2">
                    <ActionButton
                      label="Resolve"
                      tone="positive"
                      action={async () => {
                        'use server'
                        return resolveReport(report.id, 'resolved')
                      }}
                    />
                    <ActionButton
                      label="Dismiss"
                      action={async () => {
                        'use server'
                        return resolveReport(report.id, 'dismissed')
                      }}
                    />
                  </div>
                ) : (
                  <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[0.6875rem] text-ink-muted">
                    {report.status}
                  </span>
                )}
              </div>

              {report.questions ? (
                <div className="mt-3 border-t border-rule pt-3">
                  <p className="truncate text-xs text-ink-muted">
                    Q{report.questions.number}:{' '}
                    {blocksToText(parseBlocks(report.questions.body)).slice(0, 120)}
                  </p>
                  <div className="mt-1.5 flex gap-3 text-xs">
                    <Link
                      href={`/admin/questions/${report.questions.id}`}
                      className="text-accent hover:underline"
                    >
                      Edit the question
                    </Link>
                    <Link
                      href={`/practice/${report.questions.set_id}?mode=learning#question-${report.questions.id}`}
                      className="text-accent hover:underline"
                    >
                      See it in the paper
                    </Link>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
