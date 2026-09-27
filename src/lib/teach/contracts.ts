/**
 * The educator system's shared contract: routes, the shapes the teaching RPCs
 * return, and the limits every part agrees on. Client-safe — types, constants
 * and pure functions only — so the studio, the desk, the admin screens and the
 * upload routes all import the same names.
 *
 * The database side lives in supabase/migrations/0024_educators.sql and
 * 0025_question_fingerprints.sql. Each *Raw type below is exactly what one RPC
 * returns (snake_case, as PostgREST sends it); its mapper gives the camelCase
 * shape the app works with.
 */
import { parseBlocks, type Block } from '@/lib/blocks/schema'
import type { ModerationStatus, QuestionType, SolutionKind } from '@/types/db'

export { EXPLANATION_MAX_BYTES, SKETCH_MAX_BYTES } from '@/lib/blocks/schema'

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const ROUTES = {
  // Teacher pages
  teachHome: '/teach',
  teachSubject: (slug: string) => `/teach/s/${encodeURIComponent(slug)}`,
  studio: (questionId: string) => `/teach/q/${encodeURIComponent(questionId)}`,
  teachHelp: '/teach/help',
  // Admin pages
  adminEducators: '/admin/educators',
  adminDuplicates: '/admin/duplicates',
  adminSolutions: '/admin/solutions',
  // Upload API
  apiUploads: '/api/teach/uploads',
  apiUpload: (uploadId: string) => `/api/teach/uploads/${encodeURIComponent(uploadId)}`,
  apiUploadComplete: (uploadId: string) => `/api/teach/uploads/${encodeURIComponent(uploadId)}/complete`,
  // YouTube API
  apiYoutubeConnect: '/api/youtube/connect',
  apiYoutubeCallback: '/api/youtube/callback',
  apiYoutubeDisconnect: '/api/youtube/disconnect',
} as const

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Bytes sent straight to YouTube per PUT: 32 × 256 KiB. */
export const DIRECT_CHUNK_BYTES = 8_388_608
/** Bytes per PUT through our own proxy: 16 × 256 KiB, under Vercel's 4.5 MB body limit. */
export const PROXY_CHUNK_BYTES = 4_194_304

/** The recorder warns at 18 minutes and stops at 20. */
export const RECORDING_WARN_MS = 18 * 60_000
export const RECORDING_MAX_MS = 20 * 60_000

/** How long a claim holds a group for its teacher. */
export const CLAIM_HOURS = 48

/** Upload sessions a teacher may start in 24 hours, and the site in a day (YouTube allows 100). */
export const UPLOADS_PER_TEACHER_PER_DAY = 20
export const UPLOADS_PER_DAY = 90

// ---------------------------------------------------------------------------
// Explanation states
// ---------------------------------------------------------------------------

/** What the author meant by saving: keep working, send for review, or leave the status alone. */
export type ExplanationIntent = 'draft' | 'submit' | 'keep'

export interface SaveExplanationInput {
  questionId: string
  /** Omitted: the written explanation is left as it is. */
  body?: Block[]
  /** Omitted: the video is left as it is. null removes it. */
  videoUrl?: string | null
  intent: ExplanationIntent
  /**
   * Staff editing an existing explanation, someone else's included: update
   * this row, never insert a second one.
   */
  solutionId?: string
}

export type SaveExplanationResult =
  | { ok: true; solutionId: string; status: ModerationStatus; reach: number }
  | { ok: false; error: string }

/** The four states a teacher sees, read from status and submitted_at. */
export type ExplanationState = 'draft' | 'review' | 'live' | 'rejected'

export function explanationState(status: ModerationStatus, submittedAt: string | null): ExplanationState {
  if (status === 'approved') return 'live'
  if (status === 'rejected') return 'rejected'
  return submittedAt ? 'review' : 'draft'
}

export const EXPLANATION_STATE_LABELS: Record<ExplanationState, string> = {
  draft: 'Draft',
  review: 'In review',
  live: 'Published',
  rejected: 'Rejected',
}

export interface ClaimResult {
  /** True when the caller holds the group now. */
  ok: boolean
  /** Who holds it (the caller, or the teacher already on it). */
  holderName: string | null
  expiresAt: string | null
}

// ---------------------------------------------------------------------------
// Queue: rpc('teacher_queue')
// ---------------------------------------------------------------------------

export type QueueFilter = 'todo' | 'no_video' | 'review' | 'done' | 'mine' | 'all'

export const QUEUE_FILTERS: readonly QueueFilter[] = ['todo', 'no_video', 'review', 'done', 'mine', 'all']

export const QUEUE_FILTER_LABELS: Record<QueueFilter, string> = {
  todo: 'To do',
  no_video: 'Needs video',
  review: 'In review',
  done: 'Published',
  mine: 'Mine',
  all: 'All',
}

export function isQueueFilter(value: unknown): value is QueueFilter {
  return typeof value === 'string' && (QUEUE_FILTERS as readonly string[]).includes(value)
}

export interface QueueRowRaw {
  question_id: string
  paper_id: string
  set_id: string
  set_code: string
  number: number
  qtype: QuestionType
  marks: number
  snippet: string | null
  has_image: boolean | null
  session_date: string | null
  exam_name: string
  group_key: string
  copies: number
  other_subjects: string[] | null
  order_varies: boolean
  solution_id: string | null
  solution_status: ModerationStatus | null
  submitted: boolean
  has_text: boolean
  has_video: boolean
  author_name: string | null
  is_mine: boolean
  claimed_by: string | null
  claim_expires_at: string | null
  total: number
}

/** One row per duplicate group: the newest copy stands for the rest. */
export interface QueueRow {
  questionId: string
  paperId: string
  setId: string
  setCode: string
  number: number
  qtype: QuestionType
  marks: number
  snippet: string
  hasImage: boolean
  sessionDate: string | null
  examName: string
  /** The shared fingerprint, or 'q:<id>' for a question that stands alone. */
  groupKey: string
  /** Published copies an explanation here reaches, this one included. */
  copies: number
  /** Other subjects (either branch) holding a copy. */
  otherSubjects: string[]
  /** Copies show their options in different orders: name options by content. */
  orderVaries: boolean
  solutionId: string | null
  solutionStatus: ModerationStatus | null
  submitted: boolean
  hasText: boolean
  hasVideo: boolean
  authorName: string | null
  /** The caller has an explanation somewhere in this group. */
  isMine: boolean
  claimedBy: string | null
  claimExpiresAt: string | null
  /** Rows matching the filter, across all pages. */
  total: number
}

export function toQueueRow(raw: QueueRowRaw): QueueRow {
  return {
    questionId: raw.question_id,
    paperId: raw.paper_id,
    setId: raw.set_id,
    setCode: raw.set_code,
    number: raw.number,
    qtype: raw.qtype,
    marks: Number(raw.marks),
    snippet: raw.snippet ?? '',
    hasImage: Boolean(raw.has_image),
    sessionDate: raw.session_date,
    examName: raw.exam_name,
    groupKey: raw.group_key,
    copies: raw.copies,
    otherSubjects: raw.other_subjects ?? [],
    orderVaries: Boolean(raw.order_varies),
    solutionId: raw.solution_id,
    solutionStatus: raw.solution_status,
    submitted: raw.submitted,
    hasText: raw.has_text,
    hasVideo: raw.has_video,
    authorName: raw.author_name,
    isMine: raw.is_mine,
    claimedBy: raw.claimed_by,
    claimExpiresAt: raw.claim_expires_at,
    total: Number(raw.total),
  }
}

// ---------------------------------------------------------------------------
// Dashboard: rpc('teacher_subject_summary')
// ---------------------------------------------------------------------------

export interface AssignmentSummaryRaw {
  program_id: string
  program_name: string
  level_name: string
  subject_id: string
  subject_slug: string
  subject_name: string
  valid: boolean
  questions: number
  groups: number
  explained: number
  with_video: number
  in_review: number
}

/** One branch + subject combo and how far along it is, counted in groups. */
export interface AssignmentSummary {
  programId: string
  programName: string
  levelName: string
  subjectId: string
  subjectSlug: string
  subjectName: string
  /** False when the subject has moved to another branch: the combo grants nothing. */
  valid: boolean
  questions: number
  groups: number
  explained: number
  withVideo: number
  inReview: number
}

export function toAssignmentSummary(raw: AssignmentSummaryRaw): AssignmentSummary {
  return {
    programId: raw.program_id,
    programName: raw.program_name,
    levelName: raw.level_name,
    subjectId: raw.subject_id,
    subjectSlug: raw.subject_slug,
    subjectName: raw.subject_name,
    valid: raw.valid,
    questions: raw.questions,
    groups: raw.groups,
    explained: raw.explained,
    withVideo: raw.with_video,
    inReview: raw.in_review,
  }
}

// ---------------------------------------------------------------------------
// Studio: rpc('question_group_members') and rpc('group_explanations')
// ---------------------------------------------------------------------------

export interface GroupMemberRaw {
  question_id: string
  set_id: string
  set_code: string
  number: number
  paper_id: string
  session_date: string | null
  exam_name: string
  subject_name: string
  program_name: string
  is_self: boolean
  same_option_order: boolean
}

/** A published copy the explanation will also show on. */
export interface GroupMember {
  questionId: string
  setId: string
  setCode: string
  number: number
  paperId: string
  sessionDate: string | null
  examName: string
  subjectName: string
  programName: string
  isSelf: boolean
  /** This copy lists its options in the same order as the question being explained. */
  sameOptionOrder: boolean
}

export function toGroupMember(raw: GroupMemberRaw): GroupMember {
  return {
    questionId: raw.question_id,
    setId: raw.set_id,
    setCode: raw.set_code,
    number: raw.number,
    paperId: raw.paper_id,
    sessionDate: raw.session_date,
    examName: raw.exam_name,
    subjectName: raw.subject_name,
    programName: raw.program_name,
    isSelf: raw.is_self,
    sameOptionOrder: raw.same_option_order,
  }
}

/**
 * True when some copy orders its options differently: a video or text that
 * says "option B" would be wrong there, so options must be named by content.
 */
export function optionOrderVaries(members: Pick<GroupMember, 'sameOptionOrder'>[]): boolean {
  return members.some((member) => !member.sameOptionOrder)
}

export interface GroupExplanationRaw {
  id: string
  question_id: string | null
  kind: SolutionKind
  body: unknown
  video_url: string | null
  author_id: string | null
  author_name: string | null
  status: ModerationStatus
  submitted_at: string | null
  review_note: string | null
  updated_at: string
  is_mine: boolean
}

/** An explanation anywhere in the group, drafts and reviews included. */
export interface GroupExplanation {
  id: string
  /** The question it was written for; null once that question was deleted. */
  questionId: string | null
  kind: SolutionKind
  body: Block[]
  videoUrl: string | null
  authorId: string | null
  authorName: string | null
  status: ModerationStatus
  submittedAt: string | null
  reviewNote: string | null
  updatedAt: string
  isMine: boolean
}

export function toGroupExplanation(raw: GroupExplanationRaw): GroupExplanation {
  return {
    id: raw.id,
    questionId: raw.question_id,
    kind: raw.kind,
    body: parseBlocks(raw.body),
    videoUrl: raw.video_url,
    authorId: raw.author_id,
    authorName: raw.author_name,
    status: raw.status,
    submittedAt: raw.submitted_at,
    reviewNote: raw.review_note,
    updatedAt: raw.updated_at,
    isMine: raw.is_mine,
  }
}

// ---------------------------------------------------------------------------
// Admin: rpc('duplicate_review')
// ---------------------------------------------------------------------------

export type DuplicateKind = 'same_set' | 'largest' | 'cross_subject' | 'normalised_only' | 'shuffled' | 'decided'

export const DUPLICATE_KINDS: readonly DuplicateKind[] = [
  'same_set',
  'largest',
  'cross_subject',
  'normalised_only',
  'shuffled',
  'decided',
]

export interface DuplicateGroupRaw {
  fingerprint: string
  members: number
  sets: number
  subjects: string[] | null
  sample_question_id: string
  snippet: string | null
  decision: 'allow' | 'block' | null
  order_varies: boolean
  strict_variants: number
  total: number
}

// ---------------------------------------------------------------------------
// Upload API errors
// ---------------------------------------------------------------------------

export type UploadErrorCode =
  | 'not-signed-in'
  | 'not-teacher'
  | 'not-assigned'
  | 'api-uploads-off'
  | 'not-connected'
  | 'rate-limited'
  | 'too-large'
  | 'youtube-error'
  | 'expired'

/** The JSON body of every failed upload API response (HTTP 401, 403, 409, 413, 429 or 502). */
export interface UploadErrorBody {
  error: string
  code: UploadErrorCode
}
