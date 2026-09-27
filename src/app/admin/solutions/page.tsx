import Link from 'next/link'
import Form from 'next/form'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { deleteSolution, moderateSolution } from '@/app/admin/actions'
import { ActionButton } from '@/components/admin/ActionButton'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { SolutionPanel } from '@/components/question/SolutionPanel'
import { EmptyState } from '@/components/ui/EmptyState'
import { CheckCircle, Shuffle } from '@/components/ui/icons'
import { getBrowseTree } from '@/lib/queries'
import { parseBlocks } from '@/lib/blocks/schema'
import {
  EXPLANATION_STATE_LABELS,
  ROUTES,
  explanationState,
  optionOrderVaries,
  toGroupMember,
  type ExplanationState,
  type GroupExplanationRaw,
  type GroupMember,
  type GroupMemberRaw,
} from '@/lib/teach/contracts'
import type { ModerationStatus, QuestionType, SolutionKind } from '@/types/db'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ status?: string; subject?: string; author?: string; page?: string }>

type Tab = 'review' | 'drafts' | 'approved' | 'rejected' | 'all'

const TABS: { value: Tab; label: string }[] = [
  { value: 'review', label: 'In review' },
  { value: 'drafts', label: 'Drafts' },
  { value: 'approved', label: 'Published' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
]

const PAGE_SIZE = 25

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const KIND_LABELS: Record<SolutionKind, string> = {
  official: 'Official',
  authored: 'Teacher',
  community: 'Student',
  ai: 'AI',
}

const STATE_TONES: Record<ExplanationState, string> = {
  draft: 'bg-surface-2 text-ink-muted',
  review: 'bg-marked-soft text-marked',
  live: 'bg-correct-soft text-correct',
  rejected: 'bg-incorrect-soft text-incorrect',
}

interface SolutionRecord {
  id: string
  kind: SolutionKind
  body: unknown
  video_url: string | null
  status: ModerationStatus
  created_at: string
  updated_at: string
  submitted_at: string | null
  review_note: string | null
  reviewed_at: string | null
  author: { display_name: string | null } | null
  reviewer: { display_name: string | null } | null
  question: {
    id: string
    number: number
    type: QuestionType
    marks: number
    body: unknown
    correct_answer: string | null
    answer_tolerance: number | null
    set_id: string
    question_options: { id: string; label: string; content: unknown; is_correct: boolean; sort_order: number }[] | null
    question_sets: {
      set_code: string
      question_papers: {
        session_date: string | null
        subjects: { name: string } | null
        exam_types: { name: string } | null
      } | null
    } | null
  } | null
}

/** Who else in the group has something live, and every copy the explanation reaches. */
interface GroupContext {
  members: GroupMember[] | null
  otherLive: { author: string; kind: SolutionKind }[]
}

/**
 * The explanation review queue. Teachers' submissions wait here unless an
 * admin has let them publish without review; approving one puts it live on
 * every copy of its question at once, which is why each card says how many
 * copies that is.
 *
 * Profiles are embedded through named foreign keys: solutions reach profiles
 * three ways (author, reviewer, and votes), and an unnamed embed is refused
 * outright, which used to leave this queue silently empty.
 */
export default async function AdminSolutionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  // "pending" was this page's old default; the overview and old links still use it.
  const requested = params.status === 'pending' ? 'review' : params.status
  const tab: Tab = TABS.some((option) => option.value === requested) ? (requested as Tab) : 'review'
  const subjectId = UUID.test(params.subject ?? '') ? (params.subject as string) : null
  const authorId = UUID.test(params.author ?? '') ? (params.author as string) : null
  const page = Math.max(1, Math.min(1000, Number.parseInt(params.page ?? '1', 10) || 1))

  const supabase = await createClient()
  const profile = await getCurrentProfile()

  // A subject filter reaches through question → set → paper, so those joins
  // become inner joins; without one, an explanation whose question was
  // deleted still shows.
  const inner = subjectId ? '!inner' : ''
  let query = supabase
    .from('solutions')
    .select(
      `id, kind, body, video_url, status, created_at, updated_at, submitted_at, review_note, reviewed_at,
       author:profiles!solutions_author_id_fkey(display_name),
       reviewer:profiles!solutions_reviewed_by_fkey(display_name),
       question:questions!solutions_question_id_fkey${inner}(
         id, number, type, marks, body, correct_answer, answer_tolerance, set_id,
         question_options(id, label, content, is_correct, sort_order),
         question_sets${inner}(set_code, question_papers${inner}(session_date, subject_id, subjects(name), exam_types(name)))
       )`,
      { count: 'exact' },
    )

  switch (tab) {
    case 'review':
      // Submitted by a teacher, or never a draft to begin with (imported,
      // student-written). Must match the overview's "awaiting review" count.
      query = query.eq('status', 'pending').or('submitted_at.not.is.null,kind.neq.authored')
      break
    case 'drafts':
      query = query.eq('status', 'pending').is('submitted_at', null).eq('kind', 'authored')
      break
    case 'approved':
    case 'rejected':
      query = query.eq('status', tab)
      break
  }
  if (subjectId) query = query.eq('question.question_sets.question_papers.subject_id', subjectId)
  if (authorId) query = query.eq('author_id', authorId)

  // Review is first come, first served; everything else newest first.
  query =
    tab === 'review'
      ? query.order('submitted_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true })
      : query.order('updated_at', { ascending: false })

  const [result, tree, authorsResult] = await Promise.all([
    query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    getBrowseTree(),
    supabase
      .from('profiles')
      .select('id, display_name, role')
      .in('role', ['teacher', 'admin', 'contributor'])
      .order('display_name'),
  ])

  if (result.error) console.error(`admin solutions: ${result.error.message}`)
  if (authorsResult.error) console.error(`admin solutions authors: ${authorsResult.error.message}`)
  const solutions = (result.data ?? []) as unknown as SolutionRecord[]
  const total = result.count ?? solutions.length
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const authors = (authorsResult.data ?? []) as { id: string; display_name: string | null; role: string }[]

  const groups = await Promise.all(solutions.map((solution) => groupContext(supabase, solution)))

  const href = (next: Partial<{ status: Tab; page: number }>) => {
    const search = new URLSearchParams({ status: next.status ?? tab })
    if (subjectId) search.set('subject', subjectId)
    if (authorId) search.set('author', authorId)
    if (next.page && next.page > 1) search.set('page', String(next.page))
    return `${ROUTES.adminSolutions}?${search}`
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-ink">Explanations</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Approving puts an explanation live on every copy of its question. Rejecting sends the note to its author.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((option) => (
            <Link
              key={option.value}
              href={href({ status: option.value })}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                tab === option.value
                  ? 'bg-accent text-accent-ink'
                  : 'border border-rule text-ink-muted hover:border-rule-strong hover:text-ink'
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      <Form action={ROUTES.adminSolutions} className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="status" value={tab} />
        <label className="flex min-w-0 flex-col gap-1">
          <span className="label">Subject</span>
          <select
            name="subject"
            defaultValue={subjectId ?? ''}
            className="h-8 max-w-72 rounded-[3px] border border-rule bg-surface px-2 text-[0.8125rem] text-ink outline-none focus:border-accent"
          >
            <option value="">Every subject</option>
            {tree.flatMap((program) =>
              program.levels
                .filter((level) => level.subjects.length > 0)
                .map((level) => (
                  <optgroup key={level.id} label={`${program.short_name ?? program.name} › ${level.name}`}>
                    {level.subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </optgroup>
                )),
            )}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="label">Author</span>
          <select
            name="author"
            defaultValue={authorId ?? ''}
            className="h-8 max-w-56 rounded-[3px] border border-rule bg-surface px-2 text-[0.8125rem] text-ink outline-none focus:border-accent"
          >
            <option value="">Anyone</option>
            {authors.map((author) => (
              <option key={author.id} value={author.id}>
                {author.display_name ?? 'Unnamed'} ({author.role})
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex h-8 items-center rounded-[3px] border border-rule px-3 text-[0.8125rem] text-ink hover:border-rule-strong"
        >
          Filter
        </button>
        {subjectId || authorId ? (
          <Link href={`${ROUTES.adminSolutions}?status=${tab}`} className="pb-2 text-xs text-ink-muted hover:text-ink">
            Clear filters
          </Link>
        ) : null}
        {authorsResult.error ? (
          <p className="w-full text-xs text-incorrect">
            The author list could not be loaded: {authorsResult.error.message}
          </p>
        ) : null}
      </Form>

      {result.error ? (
        <p className="rounded-md bg-incorrect-soft px-3 py-2 text-xs text-incorrect">
          The explanations could not be loaded: {result.error.message}
        </p>
      ) : solutions.length === 0 && page > 1 ? (
        // Past the end, usually after approving the last few on a later page.
        <EmptyState
          size="sm"
          art="all-clear"
          title="Nothing on this page"
          actions={
            <Link href={href({ page: 1 })} className="text-xs text-accent hover:underline">
              Back to the first page
            </Link>
          }
        />
      ) : solutions.length === 0 ? (
        <EmptyState size="sm" art="all-clear" title="Nothing in this queue">
          {tab === 'review' ? 'All caught up.' : 'No explanations match.'}
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-xs text-ink-muted tabular-nums">
            {total.toLocaleString('en-IN')} explanation{total === 1 ? '' : 's'}
            {pages > 1 ? ` · page ${page} of ${pages}` : ''}
          </p>
          <ul className="flex flex-col gap-3">
            {solutions.map((solution, index) => (
              <SolutionCard
                key={solution.id}
                solution={solution}
                group={groups[index]}
                openQuestion={tab === 'review'}
                canEdit={profile?.role === 'admin'}
              />
            ))}
          </ul>
          {pages > 1 ? (
            <nav className="mt-5 flex items-center justify-between text-xs" aria-label="Pages">
              {page > 1 ? (
                <Link href={href({ page: page - 1 })} className="text-accent hover:underline">
                  Previous
                </Link>
              ) : (
                <span />
              )}
              {page < pages ? (
                <Link href={href({ page: page + 1 })} className="text-accent hover:underline">
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </div>
  )
}

/**
 * Where an explanation stands. Only a teacher's own work has a draft stage:
 * an imported or student-written one that is pending is waiting for review.
 */
function reviewState(solution: Pick<SolutionRecord, 'kind' | 'status' | 'submitted_at'>): ExplanationState {
  if (solution.kind !== 'authored' && solution.status === 'pending') return 'review'
  return explanationState(solution.status, solution.submitted_at)
}

/** Reach and neighbours of one explanation, read through the studio's own RPCs. */
async function groupContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  solution: SolutionRecord,
): Promise<GroupContext> {
  if (!solution.question) return { members: null, otherLive: [] }
  const qid = solution.question.id
  const [members, explanations] = await Promise.all([
    supabase.rpc('question_group_members', { qid }),
    // Only worth asking before approval: is something already live here?
    solution.status === 'approved' ? null : supabase.rpc('group_explanations', { qid }),
  ])
  return {
    members: members.error ? null : ((members.data ?? []) as GroupMemberRaw[]).map(toGroupMember),
    otherLive: ((explanations?.data ?? []) as GroupExplanationRaw[])
      .filter((row) => row.id !== solution.id && row.status === 'approved')
      .map((row) => ({ author: row.author_name ?? 'someone', kind: row.kind })),
  }
}

function SolutionCard({
  solution,
  group,
  openQuestion,
  canEdit,
}: {
  solution: SolutionRecord
  group: GroupContext
  openQuestion: boolean
  canEdit: boolean
}) {
  const state = reviewState(solution)
  const question = solution.question
  const paper = question?.question_sets?.question_papers
  const reach = group.members?.length ?? null
  const shuffled = group.members ? optionOrderVaries(group.members) : false
  const others = group.members?.filter((member) => !member.isSelf) ?? []
  const when = (value: string) =>
    new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <li className="rounded-lg border border-rule bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
            <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] ${STATE_TONES[state]}`}>
              {EXPLANATION_STATE_LABELS[state]}
            </span>
            <span>{KIND_LABELS[solution.kind]}</span>
            <span>·</span>
            <span className="text-ink">{solution.author?.display_name ?? 'Unknown author'}</span>
            <span>·</span>
            <span>
              {solution.submitted_at ? `submitted ${when(solution.submitted_at)}` : `started ${when(solution.created_at)}`}
            </span>
            {solution.video_url ? (
              <>
                <span>·</span>
                <span>with video</span>
              </>
            ) : null}
          </p>

          {question ? (
            <p className="mt-1.5 text-sm text-ink">
              Q{question.number} · {paper?.subjects?.name ?? 'Unknown subject'} · {paper?.exam_types?.name ?? 'Unknown exam'}
              {paper?.session_date ? ` · ${paper.session_date}` : ''} · set{' '}
              <span className="font-mono">{question.question_sets?.set_code ?? '?'}</span>
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-ink-muted">
              Its question was deleted. It still shows on copies with the same fingerprint, and moves to the next
              matching question that is imported.
            </p>
          )}

          {question ? (
            <p className="mt-0.5 text-xs text-ink-muted">
              {reach === null
                ? 'How many copies it reaches could not be read.'
                : reach <= 1
                  ? 'Shows on this question only.'
                  : `Shows on ${reach} copies of this question.`}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-start gap-2">
          <ModerationButtons solution={solution} state={state} reach={reach} />
        </div>
      </div>

      {solution.review_note ? (
        <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-xs text-ink">
          <span className="text-ink-muted">
            {/* Only a rejection's note is the reviewer's own. On work back in
                review it may be the database's ("the question changed…"),
                while reviewed_by still names whoever approved it before. */}
            Note
            {solution.status === 'rejected' && solution.reviewer?.display_name
              ? ` from ${solution.reviewer.display_name}`
              : ''}
            {solution.status === 'rejected' && solution.reviewed_at ? `, ${when(solution.reviewed_at)}` : ''}:
          </span>{' '}
          {solution.review_note}
        </p>
      ) : null}

      {group.otherLive.length ? (
        <p className="mt-3 rounded-md bg-marked-soft px-3 py-2 text-xs text-marked">
          Already live in this group: {group.otherLive.map((row) => `${row.author} (${KIND_LABELS[row.kind].toLowerCase()})`).join(', ')}.
          Approving this too shows students both.
        </p>
      ) : null}

      {shuffled ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-md bg-marked-soft px-3 py-2 text-xs text-marked">
          <Shuffle size={13} className="mt-px shrink-0" aria-hidden />
          Some copies list the options in a different order. Check the explanation and video name options by what they
          say, not by letter or position.
        </p>
      ) : null}

      {question ? (
        <details open={openQuestion} className="mt-3 rounded-md border border-rule">
          <summary className="cursor-pointer px-3 py-2 text-xs text-ink-muted hover:text-ink">
            The question and its answer
          </summary>
          <div className="border-t border-rule px-3 py-3">
            <QuestionAndAnswer question={question} />
          </div>
        </details>
      ) : null}

      <div className="mt-3 rounded-md bg-surface-2 p-3">
        <SolutionPanel
          solutions={[{ id: solution.id, kind: solution.kind, body: parseBlocks(solution.body), video_url: solution.video_url }]}
        />
      </div>

      {others.length ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink">
            The {others.length} other cop{others.length === 1 ? 'y' : 'ies'} it shows on
          </summary>
          <ul className="mt-1.5 flex flex-col gap-0.5 border-l-2 border-rule pl-3 text-xs text-ink-muted">
            {others.map((member) => (
              <li key={member.questionId}>
                <Link href={`/admin/questions/${member.questionId}`} className="text-accent hover:underline">
                  Q{member.number}
                </Link>{' '}
                · {member.programName} › {member.subjectName} · {member.examName}
                {member.sessionDate ? ` · ${member.sessionDate}` : ''} · set <span className="font-mono">{member.setCode}</span>
                {member.sameOptionOrder ? null : <span className="ml-1.5 text-marked">options in another order</span>}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {question ? (
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <Link href={`/admin/questions/${question.id}`} className="text-accent hover:underline">
            Edit the question
          </Link>
          <Link
            href={`/practice/${question.set_id}?mode=learning#question-${question.id}`}
            className="text-accent hover:underline"
          >
            See it in the paper
          </Link>
          {canEdit ? (
            <Link href={ROUTES.studio(question.id)} className="text-accent hover:underline">
              Open in the studio
            </Link>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function ModerationButtons({
  solution,
  state,
  reach,
}: {
  solution: SolutionRecord
  state: ExplanationState
  reach: number | null
}) {
  const copies = reach && reach > 1 ? ` It goes live on all ${reach} copies of the question.` : ''
  const approve = (
    <ActionButton
      label={state === 'rejected' ? 'Publish' : 'Approve'}
      tone="positive"
      confirm={state === 'rejected' ? `Publish this explanation after all?${copies}` : undefined}
      action={moderateSolution.bind(null, solution.id, 'approved')}
    />
  )
  const remove = (
    <ActionButton
      label="Delete"
      confirm={
        state === 'live'
          ? 'Delete this live explanation for good? It disappears from every copy of the question. Unpublish instead to keep it.'
          : state === 'draft'
            ? 'Delete this draft for good? The teacher has not submitted it yet.'
            : 'Delete this explanation for good?'
      }
      action={deleteSolution.bind(null, solution.id)}
    />
  )

  switch (state) {
    case 'review':
      return (
        <>
          {approve}
          <ActionButton
            label="Reject"
            tone="danger"
            prompt={{ message: 'What should the author change? They see this note.' }}
            action={moderateSolution.bind(null, solution.id, 'rejected')}
          />
          {remove}
        </>
      )
    case 'live':
      return (
        <>
          <ActionButton
            label="Unpublish"
            tone="danger"
            prompt={{ message: 'Why is it coming down? The author sees this note.', defaultValue: 'Unpublished' }}
            action={moderateSolution.bind(null, solution.id, 'rejected')}
          />
          {remove}
        </>
      )
    case 'rejected':
      return (
        <>
          {approve}
          {remove}
        </>
      )
    default:
      return remove
  }
}

function QuestionAndAnswer({ question }: { question: NonNullable<SolutionRecord['question']> }) {
  const options = [...(question.question_options ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label),
  )
  const marks = Number(question.marks)

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[0.6875rem] text-ink-faint">
        {question.type.toUpperCase()} · {marks} mark{marks === 1 ? '' : 's'}
      </p>
      <div className="paper text-ink">
        <BlockRenderer blocks={parseBlocks(question.body)} />
      </div>

      {options.length ? (
        <ol className="flex flex-col gap-1.5">
          {options.map((option) => (
            <li
              key={option.id}
              className={`flex items-start gap-2.5 rounded-md border px-2.5 py-1.5 ${
                option.is_correct ? 'border-correct/40 bg-correct-soft' : 'border-rule'
              }`}
            >
              <span className="w-5 shrink-0 font-mono text-xs text-ink-muted">{option.label}</span>
              <span className="min-w-0 flex-1 text-ink">
                <BlockRenderer blocks={parseBlocks(option.content)} context="option" />
              </span>
              {option.is_correct ? (
                <CheckCircle size={15} weight="fill" className="mt-0.5 shrink-0 text-correct" aria-label="Correct" />
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {question.correct_answer ? (
        <p className="text-sm text-ink">
          Answer: <span className="font-mono">{question.correct_answer}</span>
          {question.answer_tolerance ? ` (± ${Number(question.answer_tolerance)})` : ''}
        </p>
      ) : options.length && !options.some((option) => option.is_correct) ? (
        <p className="text-xs text-marked">No correct option is marked for this question.</p>
      ) : null}
    </div>
  )
}
