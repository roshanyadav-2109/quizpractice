import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { parseBlocks } from '@/lib/blocks/schema'
import { QuestionEditor } from '@/components/admin/QuestionEditor'
import type { QuestionOptionRow, QuestionType } from '@/types/db'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

interface QuestionRecord {
  id: string
  set_id: string
  number: number
  type: QuestionType
  marks: number
  negative_marks: number
  correct_answer: string | null
  answer_tolerance: number | null
  topics: string[]
  body: unknown
  question_sets: {
    id: string
    set_code: string
    question_papers: {
      id: string
      session_date: string | null
      subjects: { name: string } | null
      exam_types: { name: string } | null
    } | null
  } | null
}

export default async function AdminQuestionPage({ params }: { params: Params }) {
  const { id } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('questions')
    .select(
      `id, set_id, number, type, marks, negative_marks, correct_answer, answer_tolerance, topics, body,
       question_sets ( id, set_code,
         question_papers ( id, session_date, subjects(name), exam_types(name) ) )`,
    )
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()
  const question = data as unknown as QuestionRecord

  const { data: optionRows } = await supabase
    .from('question_options')
    .select('*')
    .eq('question_id', id)
    .order('sort_order')

  const options: QuestionOptionRow[] = (
    (optionRows ?? []) as (Omit<QuestionOptionRow, 'content'> & { content: unknown })[]
  ).map((option) => ({ ...option, content: parseBlocks(option.content) }))

  const paper = question.question_sets?.question_papers

  return (
    <div>
      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
        <Link href="/admin/papers" className="hover:text-ink">
          Papers
        </Link>
        <span aria-hidden>/</span>
        {paper ? (
          <Link href={`/admin/papers/${paper.id}`} className="hover:text-ink">
            {paper.subjects?.name} {paper.exam_types?.name} {paper.session_date ?? ''}
          </Link>
        ) : null}
        <span aria-hidden>/</span>
        <span>set {question.question_sets?.set_code}</span>
      </nav>

      <div className="mt-2 mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-medium text-ink">Question {question.number}</h2>
        <Link
          href={`/practice/${question.set_id}?mode=learning#question-${question.id}`}
          className="text-xs text-accent hover:underline"
        >
          View in the paper
        </Link>
      </div>

      <QuestionEditor
        question={{
          id: question.id,
          number: question.number,
          type: question.type,
          marks: Number(question.marks),
          negative_marks: Number(question.negative_marks),
          correct_answer: question.correct_answer,
          answer_tolerance:
            question.answer_tolerance === null ? null : Number(question.answer_tolerance),
          topics: question.topics ?? [],
          body: parseBlocks(question.body),
        }}
        options={options}
      />
    </div>
  )
}
