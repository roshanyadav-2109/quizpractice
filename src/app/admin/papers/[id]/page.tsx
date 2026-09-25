import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { setPaperStatus } from '@/app/admin/actions'
import { ActionButton } from '@/components/admin/ActionButton'
import { blocksToText, parseBlocks } from '@/lib/blocks/schema'
import type { ContentStatus, QuestionType } from '@/types/db'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

interface PaperDetail {
  id: string
  title: string | null
  session_date: string | null
  status: ContentStatus
  total_marks: number | null
  duration_minutes: number | null
  notes: string | null
  subjects: { name: string; slug: string } | null
  exam_types: { name: string } | null
}

interface SetDetail {
  id: string
  set_code: string
  label: string | null
  questions: {
    id: string
    number: number
    type: QuestionType
    marks: number
    body: unknown
    question_options: { id: string; is_correct: boolean }[] | null
  }[]
}

export default async function AdminPaperPage({ params }: { params: Params }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: paperRow } = await supabase
    .from('question_papers')
    .select(
      'id, title, session_date, status, total_marks, duration_minutes, notes, subjects(name, slug), exam_types(name)',
    )
    .eq('id', id)
    .maybeSingle()

  if (!paperRow) notFound()
  const paper = paperRow as unknown as PaperDetail

  const { data: setRows } = await supabase
    .from('question_sets')
    .select(
      'id, set_code, label, questions(id, number, type, marks, body, question_options(id, is_correct))',
    )
    .eq('paper_id', id)
    .order('sort_order')

  const sets = (setRows ?? []) as unknown as SetDetail[]

  return (
    <div>
      <nav className="text-xs text-ink-muted">
        <Link href="/admin/papers" className="hover:text-ink">
          Papers
        </Link>
      </nav>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium text-ink">
            {paper.subjects?.name} — {paper.exam_types?.name}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {paper.session_date ?? 'undated'}
            {paper.total_marks ? ` · ${paper.total_marks} marks` : ''}
            {paper.duration_minutes ? ` · ${paper.duration_minutes} min` : ''} ·{' '}
            <span className="font-mono">{paper.status}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
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
          {paper.subjects ? (
            <Link
              href={`/subject/${paper.subjects.slug}`}
              className="rounded-md border border-rule px-2.5 py-1.5 text-xs text-ink-muted hover:border-rule-strong hover:text-ink"
            >
              View public page
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-8">
        {sets.map((set) => {
          const questions = [...set.questions].sort((a, b) => a.number - b.number)
          const missingAnswers = questions.filter(
            (question) =>
              (question.type === 'mcq' || question.type === 'msq') &&
              !(question.question_options ?? []).some((option) => option.is_correct),
          )

          return (
            <section key={set.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-2">
                <h3 className="font-medium text-ink">
                  Set {set.set_code}
                  {set.label ? <span className="ml-2 text-ink-muted">{set.label}</span> : null}
                </h3>
                <div className="flex items-center gap-3 text-xs text-ink-muted">
                  <span>{questions.length} questions</span>
                  <Link
                    href={`/practice/${set.id}?mode=learning`}
                    className="text-accent hover:underline"
                  >
                    Preview
                  </Link>
                </div>
              </div>

              {missingAnswers.length > 0 ? (
                <p className="mt-3 rounded-md bg-marked-soft px-3 py-2 text-xs text-marked">
                  {missingAnswers.length} choice question
                  {missingAnswers.length === 1 ? ' has' : 's have'} no correct option marked —
                  they will always mark as incorrect until fixed.
                </p>
              ) : null}

              <ul className="mt-3 flex flex-col gap-1.5">
                {questions.map((question) => {
                  const preview = blocksToText(parseBlocks(question.body)).slice(0, 130)
                  const noAnswer =
                    (question.type === 'mcq' || question.type === 'msq') &&
                    !(question.question_options ?? []).some((option) => option.is_correct)

                  return (
                    <li key={question.id}>
                      <Link
                        href={`/admin/questions/${question.id}`}
                        className="flex items-start gap-3 rounded-md border border-rule bg-surface px-3 py-2 transition-colors hover:border-rule-strong"
                      >
                        <span className="w-7 shrink-0 font-mono text-xs text-ink-muted tabular-nums">
                          {question.number}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">
                          {preview || (
                            <span className="text-ink-faint italic">Empty question body</span>
                          )}
                        </span>
                        <span className="shrink-0 font-mono text-[0.6875rem] text-ink-faint">
                          {question.type} · {Number(question.marks)}m
                        </span>
                        {noAnswer ? (
                          <span className="shrink-0 text-[0.6875rem] text-marked">no key</span>
                        ) : null}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}

        {sets.length === 0 ? (
          <p className="rounded-lg border border-dashed border-rule px-4 py-10 text-center text-sm text-ink-muted">
            This paper has no sets yet.
          </p>
        ) : null}
      </div>
    </div>
  )
}
