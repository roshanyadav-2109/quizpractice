import 'server-only'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { getPapersForSubject } from '@/lib/queries'
import { formatSession } from '@/lib/format'
import {
  explanationState,
  toAssignmentSummary,
  toQueueRow,
  type AssignmentSummary,
  type AssignmentSummaryRaw,
  type ExplanationState,
  type QueueFilter,
  type QueueRow,
  type QueueRowRaw,
} from '@/lib/teach/contracts'
import type { ModerationStatus } from '@/types/db'

/**
 * What the teaching desk reads: the teacher's combos and their progress, one
 * subject's queue, and the teacher's own explanations and holds.
 *
 * Everything runs as the signed-in teacher and is deliberately not cached.
 * The desk has a handful of users, each wants to see a save the moment it
 * lands, and every row is small — the queue sends 50 snippets, not questions.
 * The one shared read, a subject's list of papers, comes from the catalogue
 * cache in src/lib/queries.ts like every other page.
 *
 * Which subjects a teacher may see is the database's decision: teacher_queue
 * refuses with 42501 outside the caller's combos, and that refusal becomes
 * NotAssignedError here so the page can answer with its 403 view.
 */

/** Groups per page of the queue. */
export const QUEUE_PAGE_SIZE = 50

/** A queue slower than this is logged: past a second, the desk feels broken. */
const SLOW_QUEUE_MS = 1000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/** The subject is not one of the caller's combos (or its branch no longer matches). */
export class NotAssignedError extends Error {
  constructor() {
    super('You are not assigned to this subject.')
    this.name = 'NotAssignedError'
  }
}

function refused(error: { code?: string } | null): boolean {
  return error?.code === '42501'
}

// ---------------------------------------------------------------------------
// Combos
// ---------------------------------------------------------------------------

/** The caller's branch + subject combos with their progress, in catalogue order. */
export async function getMySummary(): Promise<AssignmentSummary[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('teacher_subject_summary')
  if (error) {
    // Signed out between the gate and here: nothing is assigned.
    if (refused(error)) return []
    throw new Error(`teacher_subject_summary failed — ${error.message}`)
  }
  return ((data ?? []) as AssignmentSummaryRaw[]).map(toAssignmentSummary)
}

/**
 * Whether the caller may work on this subject today: an admin always, a
 * teacher through a combo whose branch still holds the subject.
 */
export async function canTeachSubject(subjectId: string): Promise<boolean> {
  if (!isUuid(subjectId)) return false
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('can_teach_subject', { p_subject: subjectId })
  if (error) {
    if (refused(error)) return false
    throw new Error(`can_teach_subject failed — ${error.message}`)
  }
  return data === true
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

export interface QueuePage {
  rows: QueueRow[]
  /** Groups matching the filter across every page; 0 when this page is empty. */
  total: number
  page: number
  pageSize: number
}

/**
 * One page of a subject's queue: one row per duplicate group, the newest copy
 * standing for the rest. `page` counts from 1.
 */
export async function getQueue(
  subjectId: string,
  filter: QueueFilter,
  paperId: string | null,
  page: number,
): Promise<QueuePage> {
  const supabase = await createClient()
  const started = Date.now()
  const { data, error } = await supabase.rpc('teacher_queue', {
    p_subject: subjectId,
    p_filter: filter,
    p_paper: paperId,
    p_limit: QUEUE_PAGE_SIZE,
    p_offset: (page - 1) * QUEUE_PAGE_SIZE,
  })
  const took = Date.now() - started
  if (took > SLOW_QUEUE_MS) {
    console.warn(`teacher_queue took ${took} ms (subject ${subjectId}, filter ${filter}, page ${page})`)
  }

  if (error) {
    if (refused(error)) throw new NotAssignedError()
    throw new Error(`teacher_queue failed — ${error.message}`)
  }

  const rows = ((data ?? []) as QueueRowRaw[]).map(toQueueRow)
  return { rows, total: rows[0]?.total ?? 0, page, pageSize: QUEUE_PAGE_SIZE }
}

export interface PaperOption {
  id: string
  /** "Quiz 1 · 12 Apr 2026" */
  label: string
}

/** A subject's published papers, newest sitting first, for the queue's paper filter. */
export async function getSubjectPapers(subjectId: string): Promise<PaperOption[]> {
  const papers = await getPapersForSubject(subjectId)
  return papers.map((paper) => ({
    id: paper.id,
    label: `${paper.exam_type.name} · ${formatSession(paper.session_date)}`,
  }))
}

// ---------------------------------------------------------------------------
// The teacher's own explanations and holds
// ---------------------------------------------------------------------------

/** Where an explanation's question sits in the catalogue. */
export interface QuestionPlace {
  number: number
  setCode: string
  paperId: string
  sessionDate: string | null
  examName: string
  subjectId: string
  subjectName: string
  subjectSlug: string
}

/** One of the caller's explanations, as the desk lists it. */
export interface MyExplanation {
  id: string
  /** The question it was written for; null once that question was deleted. */
  questionId: string | null
  state: ExplanationState
  reviewNote: string | null
  updatedAt: string
  hasVideo: boolean
  /** Null when the question is gone, or no longer readable by the caller. */
  place: QuestionPlace | null
}

interface MyExplanationRaw {
  id: string
  question_id: string | null
  status: ModerationStatus
  submitted_at: string | null
  review_note: string | null
  updated_at: string
  video_url: string | null
  question: {
    number: number
    set: {
      set_code: string
      paper_id: string
      paper: {
        session_date: string | null
        subject_id: string
        exam_type: { name: string } | null
        subject: { name: string; slug: string } | null
      } | null
    } | null
  } | null
}

// The body is left out on purpose: it can run to 300 kB, and a list needs
// only the state. The FK is named, as every solutions embed should be: the
// table already reaches profiles two ways, and PostgREST refuses to guess
// when a second path appears.
const MINE_SELECT = `
  id, question_id, status, submitted_at, review_note, updated_at, video_url,
  question:questions!solutions_question_id_fkey(
    number,
    set:question_sets(
      set_code, paper_id,
      paper:question_papers(session_date, subject_id, exam_type:exam_types(name), subject:subjects(name, slug))
    )
  )`

function toMyExplanation(raw: MyExplanationRaw): MyExplanation {
  const set = raw.question?.set ?? null
  const paper = set?.paper ?? null
  return {
    id: raw.id,
    questionId: raw.question_id,
    state: explanationState(raw.status, raw.submitted_at),
    reviewNote: raw.review_note,
    updatedAt: raw.updated_at,
    hasVideo: raw.video_url !== null,
    place:
      raw.question && set && paper
        ? {
            number: raw.question.number,
            setCode: set.set_code,
            paperId: set.paper_id,
            sessionDate: paper.session_date,
            examName: paper.exam_type?.name ?? 'Paper',
            subjectId: paper.subject_id,
            subjectName: paper.subject?.name ?? 'Subject',
            subjectSlug: paper.subject?.slug ?? '',
          }
        : null,
  }
}

type MineFilter = 'all' | 'drafts' | 'changes'

async function listMine(which: MineFilter, limit: number): Promise<MyExplanation[]> {
  const profile = await getCurrentProfile()
  if (!profile) return []

  const supabase = await createClient()
  let query = supabase.from('solutions').select(MINE_SELECT).eq('author_id', profile.id).eq('kind', 'authored')
  if (which === 'drafts') query = query.eq('status', 'pending').is('submitted_at', null)
  if (which === 'changes') query = query.eq('status', 'rejected')

  const { data, error } = await query
    .order('updated_at', { ascending: false })
    .limit(limit)
    .returns<MyExplanationRaw[]>()
  if (error) throw new Error(`my explanations failed — ${error.message}`)
  return (data ?? []).map(toMyExplanation)
}

/** The caller's latest explanations in any state, newest change first. */
export async function getMyRecentExplanations(limit = 10): Promise<MyExplanation[]> {
  return listMine('all', limit)
}

/**
 * The caller's explanations that a reviewer sent back, or an admin took
 * down: rejected, usually with a note saying what to change.
 */
export async function getMyNeedingChanges(): Promise<MyExplanation[]> {
  return listMine('changes', 100)
}

/** A group the caller is holding so no one else records it at the same time. */
export interface MyClaim {
  groupKey: string
  questionId: string
  expiresAt: string
  /** Null when the question is no longer readable by the caller. */
  subjectId: string | null
}

interface MyClaimRaw {
  group_key: string
  question_id: string
  expires_at: string
  question: { set: { paper: { subject_id: string } | null } | null } | null
}

/** The caller's live holds, newest first. */
export async function getMyClaims(): Promise<MyClaim[]> {
  const profile = await getCurrentProfile()
  if (!profile) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('explanation_claims')
    .select(
      'group_key, question_id, expires_at, question:questions(set:question_sets(paper:question_papers(subject_id)))',
    )
    .eq('teacher_id', profile.id)
    .gt('expires_at', new Date().toISOString())
    .order('claimed_at', { ascending: false })
    .limit(100)
    .returns<MyClaimRaw[]>()
  if (error) throw new Error(`my claims failed — ${error.message}`)

  return (data ?? []).map((row) => ({
    groupKey: row.group_key,
    questionId: row.question_id,
    expiresAt: row.expires_at,
    subjectId: row.question?.set?.paper?.subject_id ?? null,
  }))
}

/**
 * Where "Continue" should take the teacher in one subject: work already
 * under way first — a draft, then an explanation sent back for changes, then
 * a question they are holding — and otherwise the first group nobody has
 * started and nobody else is holding. Null when there is nothing left to do.
 */
export async function nextQuestionFor(subjectId: string): Promise<string | null> {
  const [drafts, changes, claims] = await Promise.all([
    listMine('drafts', 100),
    listMine('changes', 100),
    getMyClaims(),
  ])

  const inSubject = (item: MyExplanation) => item.questionId !== null && item.place?.subjectId === subjectId
  const underWay = drafts.find(inSubject) ?? changes.find(inSubject)
  if (underWay?.questionId) return underWay.questionId

  const held = claims.find((claim) => claim.subjectId === subjectId)
  if (held) return held.questionId

  // Holds are advisory, so a held group is skipped rather than refused; the
  // caller's own holds were taken care of above.
  const { rows } = await getQueue(subjectId, 'todo', null, 1)
  return rows.find((row) => !row.claimExpiresAt)?.questionId ?? null
}
