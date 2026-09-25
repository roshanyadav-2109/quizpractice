import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { moderateSolution } from '@/app/admin/actions'
import { ActionButton } from '@/components/admin/ActionButton'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { blocksToText, parseBlocks } from '@/lib/blocks/schema'
import type { ModerationStatus, SolutionKind } from '@/types/db'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ status?: string }>

interface SolutionRecord {
  id: string
  kind: SolutionKind
  body: unknown
  video_url: string | null
  status: ModerationStatus
  created_at: string
  questions: { id: string; number: number; body: unknown; set_id: string } | null
  profiles: { display_name: string | null } | null
}

export default async function AdminSolutionsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { status = 'pending' } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('solutions')
    .select(
      'id, kind, body, video_url, status, created_at, questions(id, number, body, set_id), profiles(display_name)',
    )
    .order('created_at', { ascending: false })
    .limit(100)

  if (status !== 'all') query = query.eq('status', status)

  const { data } = await query
  const solutions = (data ?? []) as unknown as SolutionRecord[]

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-ink">Solutions</h2>

        </div>
        <div className="flex gap-1.5">
          {['pending', 'approved', 'rejected', 'all'].map((value) => (
            <Link
              key={value}
              href={`/admin/solutions?status=${value}`}
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

      {solutions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-rule px-4 py-12 text-center text-sm text-ink-muted">
          Nothing in this queue.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {solutions.map((solution) => (
            <li key={solution.id} className="rounded-lg border border-rule bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-ink-muted">
                    <span className="font-mono">{solution.kind}</span> ·{' '}
                    {solution.profiles?.display_name ?? 'Unknown'} ·{' '}
                    {new Date(solution.created_at).toLocaleDateString('en-GB')}
                  </p>
                  {solution.questions ? (
                    <p className="mt-1 truncate text-sm text-ink">
                      Q{solution.questions.number}:{' '}
                      {blocksToText(parseBlocks(solution.questions.body)).slice(0, 110)}
                    </p>
                  ) : null}
                </div>

                {solution.status === 'pending' ? (
                  <div className="flex shrink-0 gap-2">
                    <ActionButton
                      label="Approve"
                      tone="positive"
                      action={async () => {
                        'use server'
                        return moderateSolution(solution.id, 'approved')
                      }}
                    />
                    <ActionButton
                      label="Reject"
                      tone="danger"
                      action={async () => {
                        'use server'
                        return moderateSolution(solution.id, 'rejected')
                      }}
                    />
                  </div>
                ) : (
                  <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[0.6875rem] text-ink-muted">
                    {solution.status}
                  </span>
                )}
              </div>

              <div className="mt-3 rounded-md bg-surface-2 p-3">
                {solution.video_url ? (
                  <p className="mb-2 truncate font-mono text-xs text-accent">
                    {solution.video_url}
                  </p>
                ) : null}
                <BlockRenderer blocks={parseBlocks(solution.body)} context="solution" />
              </div>

              {solution.questions ? (
                <Link
                  href={`/admin/questions/${solution.questions.id}`}
                  className="mt-2 inline-block text-xs text-accent hover:underline"
                >
                  Open the question
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
