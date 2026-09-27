import { cache } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient, getCurrentProfile, isTeacher, teacherPageGate, type CurrentProfile } from '@/lib/supabase/server'
import { getSetContext, type SetContext } from '@/lib/queries'
import { isSupabaseConfigured, publicEnv } from '@/lib/env'
import { blocksToText, parseBlocks } from '@/lib/blocks/schema'
import { formatSession } from '@/lib/format'
import { youtubeApiUploadsEnabled } from '@/lib/youtube/connection'
import {
  ROUTES,
  toGroupExplanation,
  toGroupMember,
  type GroupExplanationRaw,
  type GroupMember,
  type GroupMemberRaw,
} from '@/lib/teach/contracts'
import { SetupNotice } from '@/components/site/SetupNotice'
import { EmptyState } from '@/components/ui/EmptyState'
import { buttonClass } from '@/components/ui/primitives'
import { Studio, type AnswerKeyReport, type StudioClaim, type StudioPlace } from '@/components/studio/Studio'
import type { QuestionOptionRow, QuestionWithOptions } from '@/types/db'

export const dynamic = 'force-dynamic'

type Params = Promise<{ questionId: string }>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ROBOTS: Metadata['robots'] = { index: false, follow: false }

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { questionId } = await params
  const fallback: Metadata = { title: 'Explanation studio', robots: ROBOTS }
  if (!isSupabaseConfigured || !UUID.test(questionId)) return fallback
  if (!isTeacher(await getCurrentProfile())) return fallback

  const loaded = await loadQuestion(questionId).catch(() => null)
  if (!loaded) return fallback
  const { question, context } = loaded
  if (!context) return { title: `Q${question.number} — explanation`, robots: ROBOTS }

  const snippet = blocksToText(question.body).slice(0, 150)
  return {
    title: `${context.subject.name} · ${context.examType.name} ${formatSession(context.paper.session_date)} · Q${question.number} — explanation`,
    description: `${snippet}${snippet.length === 150 ? '…' : ''} ${publicEnv.siteUrl}/paper/${context.set.id}`.trim(),
    robots: ROBOTS,
  }
}

/**
 * The explanation studio: one question, everything a teacher needs to
 * explain it, and the tools to write the explanation, record it on the board
 * and put the video on YouTube.
 *
 * Opening the page only reads. The question is held for the teacher (a
 * claim) by the studio's first edit, recording or save, not by rendering —
 * an admin looking at a question never takes it from the teacher working on
 * it, and a teacher skimming questions does not lock them.
 *
 * Who may open it is the database's decision: can_teach_question() admits an
 * admin, or a teacher whose branch + subject combo still holds the question's
 * subject. Anyone else gets the 403 view.
 */
export default async function StudioPage({ params }: { params: Params }) {
  if (!isSupabaseConfigured) return <SetupNotice />

  const { questionId } = await params
  const profile = await teacherPageGate(ROUTES.studio(questionId))
  if (!UUID.test(questionId)) notFound()

  const studio = await loadStudio(questionId, profile)
  if (studio === 'forbidden') return <NotYours />
  if (!studio) notFound()

  return <Studio {...studio} />
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

type RawQuestion = Omit<QuestionWithOptions, 'body' | 'options'> & {
  body: unknown
  options: (Omit<QuestionOptionRow, 'content'> & { content: unknown })[] | null
}

function parseQuestion(raw: RawQuestion): QuestionWithOptions {
  return {
    ...raw,
    body: parseBlocks(raw.body),
    options: (raw.options ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
      .map((option) => ({ ...option, content: parseBlocks(option.content) })),
  }
}

/**
 * The question with its answer key, and its paper when the caller can read
 * it. A published set comes from the shared set cache (no database read);
 * a question in a draft paper, which only its teachers and staff can see, is
 * read live on its own.
 */
const loadQuestion = cache(
  async (questionId: string): Promise<{ question: QuestionWithOptions; context: SetContext | null } | null> => {
    const supabase = await createClient()
    const { data: row } = await supabase
      .from('questions')
      .select('id, set_id')
      .eq('id', questionId)
      .maybeSingle<{ id: string; set_id: string }>()
    if (!row) return null

    const context = await getSetContext(row.set_id, { includeAnswers: true }).catch(() => null)
    const cached = context?.questions.find((question) => question.id === questionId)
    if (cached) return { question: cached, context }

    const { data } = await supabase
      .from('questions')
      .select('*, options:question_options(id, question_id, label, content, is_correct, sort_order)')
      .eq('id', questionId)
      .maybeSingle<RawQuestion>()
    return data ? { question: parseQuestion(data), context } : null
  },
)

async function loadStudio(questionId: string, profile: CurrentProfile) {
  const supabase = await createClient()
  const { data: allowed, error: allowedError } = await supabase.rpc('can_teach_question', { qid: questionId })
  if (allowedError) throw new Error(`can_teach_question failed — ${allowedError.message}`)
  if (allowed !== true) return 'forbidden' as const

  const [loaded, membersResult, explanationsResult, groupKeyResult, trustedResult, apiUploads] = await Promise.all([
    loadQuestion(questionId),
    supabase.rpc('question_group_members', { qid: questionId }),
    supabase.rpc('group_explanations', { qid: questionId }),
    supabase.rpc('group_key', { qid: questionId }),
    supabase.rpc('my_auto_publish'),
    youtubeApiUploadsEnabled(),
  ])
  if (!loaded) return null
  if (membersResult.error) throw new Error(`question_group_members failed — ${membersResult.error.message}`)
  if (explanationsResult.error) throw new Error(`group_explanations failed — ${explanationsResult.error.message}`)

  const members = ((membersResult.data ?? []) as GroupMemberRaw[]).map(toGroupMember)
  const explanations = ((explanationsResult.data ?? []) as GroupExplanationRaw[]).map(toGroupExplanation)
  const groupKey = typeof groupKeyResult.data === 'string' ? groupKeyResult.data : null

  const [claim, reports] = await Promise.all([
    readClaim(groupKey, profile.id),
    readAnswerKeyReports(
      members.map((member) => member.questionId),
      questionId,
      profile.id,
    ),
  ])

  return {
    question: loaded.question,
    place: placeOf(questionId, loaded.question, loaded.context, members),
    members,
    explanations,
    claim,
    reports,
    apiUploads,
    viewer: {
      id: profile.id,
      name: profile.displayName,
      isAdmin: profile.role === 'admin',
      trusted: profile.role === 'admin' || trustedResult.data === true,
    },
  }
}

/** Where the question sits: from its paper when readable, else from its own row in the group. */
function placeOf(
  questionId: string,
  question: QuestionWithOptions,
  context: SetContext | null,
  members: GroupMember[],
): StudioPlace {
  if (context) {
    return {
      questionId,
      paperUrl: `${publicEnv.siteUrl}/paper/${context.set.id}`,
      setId: context.set.id,
      paperId: context.paper.id,
      setCode: context.set.set_code,
      number: question.number,
      sessionDate: context.paper.session_date,
      examName: context.examType.name,
      subjectName: context.subject.name,
      subjectSlug: context.subject.slug,
      programName: context.program.name,
      levelName: context.level.name,
    }
  }
  const self = members.find((member) => member.isSelf)
  const setId = self?.setId ?? question.set_id
  return {
    questionId,
    paperUrl: `${publicEnv.siteUrl}/paper/${setId}`,
    setId,
    paperId: self?.paperId ?? null,
    setCode: self?.setCode ?? '',
    number: question.number,
    sessionDate: self?.sessionDate ?? null,
    examName: self?.examName ?? 'Paper',
    subjectName: self?.subjectName ?? 'Subject',
    subjectSlug: null,
    programName: self?.programName ?? '',
    levelName: null,
  }
}

/** Who holds the group now, if anyone. Read only: nothing is claimed by looking. */
async function readClaim(groupKey: string | null, viewerId: string): Promise<StudioClaim | null> {
  if (!groupKey) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('explanation_claims')
    .select('teacher_id, expires_at, holder:profiles!explanation_claims_teacher_id_fkey(display_name)')
    .eq('group_key', groupKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle<{ teacher_id: string; expires_at: string; holder: { display_name: string | null } | null }>()
  if (!data) return null
  return { holderName: data.holder?.display_name ?? null, expiresAt: data.expires_at, mine: data.teacher_id === viewerId }
}

/**
 * Open reports that the answer key is wrong, on this question or any copy of
 * it the caller can see. While one is open the studio holds back Submit.
 */
async function readAnswerKeyReports(
  memberIds: string[],
  questionId: string,
  viewerId: string,
): Promise<AnswerKeyReport[]> {
  const ids = Array.from(new Set([questionId, ...memberIds])).slice(0, 100)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reports')
    .select('id, user_id, description, created_at')
    .eq('kind', 'wrong_answer')
    .eq('status', 'open')
    .in('question_id', ids)
    .order('created_at', { ascending: false })
    .limit(20)
    .returns<{ id: string; user_id: string | null; description: string; created_at: string }[]>()
  if (error) {
    console.error(`answer-key reports failed — ${error.message}`)
    return []
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    description: row.description,
    mine: row.user_id === viewerId,
  }))
}

/** The 403 view: the studio owns the viewport, so this stands on its own. */
function NotYours() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <EmptyState
        art="sign-in-required"
        size="lg"
        title="This question is not in your subjects"
        actions={
          <Link href={ROUTES.teachHome} className={buttonClass('primary', 'md')}>
            Back to your subjects
          </Link>
        }
      >
        You can explain questions only in the subjects an admin has assigned you. To work on this one, ask an admin to
        add its subject to your subjects.
      </EmptyState>
    </div>
  )
}
