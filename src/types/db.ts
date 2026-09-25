/**
 * Row shapes for the tables in supabase/migrations.
 *
 * These are hand-written rather than generated because the project is not
 * linked to a Supabase instance yet. Once it is, `supabase gen types typescript
 * --linked > src/types/database.ts` produces the fully generated equivalent and
 * these can be narrowed to it. Query sites use `.returns<T[]>()` so the shapes
 * below are what the app actually type-checks against.
 */
import type { Block, QuestionType } from '@/lib/blocks/schema'

export type { QuestionType }

export type UserRole = 'student' | 'teacher' | 'contributor' | 'admin'
export type ContentStatus = 'draft' | 'published' | 'archived'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type SolutionKind = 'official' | 'authored' | 'community' | 'ai'
export type ModerationStatus = 'pending' | 'approved' | 'rejected'
export type AttemptMode = 'exam' | 'learning'
export type ReportKind = 'correction' | 'broken_format' | 'wrong_answer' | 'other'
export type ReportStatus = 'open' | 'resolved' | 'dismissed'
export type ExtractionStatus = 'pending' | 'in_review' | 'approved' | 'rejected'

export interface Program {
  id: string
  slug: string
  name: string
  short_name: string | null
  description: string | null
  accent: string | null
  sort_order: number
  is_active: boolean
}

export interface Level {
  id: string
  program_id: string
  slug: string
  name: string
  code: string | null
  credits: number | null
  sort_order: number
  is_active: boolean
}

export interface Subject {
  id: string
  level_id: string
  slug: string
  name: string
  code: string | null
  aliases: string[]
  has_programming: boolean
  description: string | null
  sort_order: number
  is_active: boolean
}

export interface ExamType {
  id: string
  slug: string
  name: string
  description: string | null
  default_duration_minutes: number | null
  sort_order: number
  is_active: boolean
}

export interface QuestionPaper {
  id: string
  subject_id: string
  exam_type_id: string
  title: string | null
  session_date: string | null
  year: number | null
  duration_minutes: number | null
  total_marks: number | null
  status: ContentStatus
  notes: string | null
  created_at: string
}

export interface QuestionSet {
  id: string
  paper_id: string
  set_code: string
  label: string | null
  sort_order: number
}

export interface QuestionRow {
  id: string
  set_id: string
  number: number
  type: QuestionType
  body: Block[]
  schema_version: number
  marks: number
  negative_marks: number
  correct_answer: string | null
  answer_tolerance: number | null
  topics: string[]
  difficulty: Difficulty | null
  status: ContentStatus
}

export interface QuestionOptionRow {
  id: string
  question_id: string
  label: string
  content: Block[]
  is_correct: boolean
  sort_order: number
}

/** What the exam runner receives in exam mode: no is_correct. */
export type QuestionOptionPublic = Omit<QuestionOptionRow, 'is_correct'> & {
  is_correct?: boolean
}

export interface SolutionRow {
  id: string
  question_id: string
  kind: SolutionKind
  body: Block[]
  video_url: string | null
  author_id: string | null
  status: ModerationStatus
  upvotes: number
  created_at: string
}

export interface DiscussionRow {
  id: string
  question_id: string
  user_id: string | null
  parent_id: string | null
  body: string
  is_deleted: boolean
  created_at: string
  profiles?: { display_name: string | null; avatar_url: string | null } | null
}

export interface ReportRow {
  id: string
  question_id: string
  user_id: string | null
  kind: ReportKind
  description: string
  status: ReportStatus
  created_at: string
}

export interface AttemptRow {
  id: string
  user_id: string
  set_id: string
  mode: AttemptMode
  started_at: string
  submitted_at: string | null
  score: number | null
  max_score: number | null
  duration_seconds: number | null
}

export interface AttemptAnswerRow {
  id: string
  attempt_id: string
  question_id: string
  response: AnswerResponse | null
  is_correct: boolean | null
  marks_awarded: number | null
  /** Dwell time on this question. Null for attempts recorded before timing existed. */
  time_spent_seconds: number | null
}

/** What a student submitted for one question. */
export type AnswerResponse =
  | { option_ids: string[] }
  | { value: string }
  | { text: string }

export interface SubjectStats {
  subject_id: string
  paper_count: number
  set_count: number
  question_count: number
  video_solution_count: number
  latest_session: string | null
}

export interface ProgramStats {
  program_id: string
  subject_count: number
  paper_count: number
  question_count: number
}

export interface ExtractionRow {
  id: string
  paper_id: string | null
  question_id: string | null
  source_public_id: string | null
  raw_output: unknown
  confidence: number | null
  extracted_by: string | null
  status: ExtractionStatus
  notes: string | null
  created_at: string
}

/** A question with everything needed to render and score it. */
export interface QuestionWithOptions extends QuestionRow {
  options: QuestionOptionRow[]
}
