import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { setPaperStatus, deletePaper } from '@/app/admin/actions'
import { ActionButton } from '@/components/admin/ActionButton'
import type { ContentStatus } from '@/types/db'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ status?: string }>

interface PaperRow {
  id: string
  title: string | null
  session_date: string | null
  status: ContentStatus
  total_marks: number | null
  subjects: { name: string; slug: string } | null
  exam_types: { name: string } | null
  question_sets: { id: string; set_code: string; questions: { id: string }[] | null }[] | null
}

export default async function AdminPapersPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { status } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('question_papers')
    .select(
      'id, title, session_date, status, total_marks, subjects(name, slug), exam_types(name), question_sets(id, set_code, questions(id))',
    )
    .order('session_date', { ascending: false, nullsFirst: false })
    .limit(200)

  if (status === 'draft' || status === 'published' || status === 'archived') {
    query = query.eq('status', status)
  }

  const { data } = await query
  const papers = (data ?? []) as unknown as PaperRow[]

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-ink">Papers</h2>
          <p className="text-sm text-ink-muted">
            {papers.length} paper{papers.length === 1 ? '' : 's'}
            {status ? ` with status ${status}` : ''}
          </p>
        </div>
        <div className="flex gap-1.5">
          <StatusChip active={!status} href="/admin/papers">
            All
          </StatusChip>
          <StatusChip active={status === 'draft'} href="/admin/papers?status=draft">
            Draft
          </StatusChip>
          <StatusChip active={status === 'published'} href="/admin/papers?status=published">
            Published
          </StatusChip>
        </div>
      </div>

      {papers.length === 0 ? (
        <p className="border border-dashed border-rule px-4 py-10 text-center text-[0.8125rem] text-ink-muted">
          Nothing here yet.{' '}
          <Link href="/admin/import" className="text-accent underline underline-offset-2">
            Import a paper
          </Link>
          .
        </p>
      ) : (
        <ul className="border-t border-rule">
          {papers.map((paper) => {
            const questionCount = (paper.question_sets ?? []).reduce(
              (sum, set) => sum + (set.questions?.length ?? 0),
              0,
            )

            return (
              <li
                key={paper.id}
                className="border-b border-rule px-1 py-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/papers/${paper.id}`}
                      className="text-ink hover:text-accent"
                    >
                      {paper.subjects?.name ?? 'Unknown subject'}
                      <span className="ml-2 font-normal text-ink-muted">
                        {paper.exam_types?.name}
                      </span>
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {paper.session_date ?? 'undated'} ·{' '}
                      {(paper.question_sets ?? []).length} set
                      {(paper.question_sets ?? []).length === 1 ? '' : 's'} · {questionCount}{' '}
                      questions
                      {paper.total_marks ? ` · ${paper.total_marks} marks` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={paper.status} />
                    {paper.status === 'published' ? (
                      <ActionButton
                        label="Unpublish"
                        action={async () => {
                          'use server'
                          return setPaperStatus(paper.id, 'draft')
                        }}
                      />
                    ) : (
                      <ActionButton
                        label="Publish"
                        tone="positive"
                        action={async () => {
                          'use server'
                          return setPaperStatus(paper.id, 'published')
                        }}
                      />
                    )}
                    <ActionButton
                      label="Delete"
                      tone="danger"
                      confirm="Delete this paper and every question in it? This cannot be undone."
                      action={async () => {
                        'use server'
                        return deletePaper(paper.id)
                      }}
                    />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function StatusChip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-6 items-center rounded-[3px] px-2 text-[0.75rem] transition-colors ${
        active
          ? 'bg-ink text-bg'
          : 'border border-rule text-ink-muted hover:border-rule-strong hover:text-ink'
      }`}
    >
      {children}
    </Link>
  )
}

function StatusBadge({ status }: { status: ContentStatus }) {
  const tone =
    status === 'published'
      ? 'bg-correct-soft text-correct'
      : status === 'draft'
        ? 'bg-marked-soft text-marked'
        : 'bg-surface-2 text-ink-muted'

  return (
    <span className={`rounded-[3px] px-1.5 py-0.5 font-mono text-[0.65625rem] ${tone}`}>{status}</span>
  )
}
