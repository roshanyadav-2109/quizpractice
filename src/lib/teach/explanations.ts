import 'server-only'
import { createClient, getCurrentProfile, isStaff, isTeacher } from '@/lib/supabase/server'
import { TAG, refresh } from '@/lib/cache'
import { explanationBlocksSchema, type Block } from '@/lib/blocks/schema'
import { canonicalYouTubeUrl, parseYouTubeUrl } from '@/lib/youtube/url'
import type { ActionState } from '@/app/admin/actions'
import type {
  ClaimResult,
  ExplanationIntent,
  GroupExplanationRaw,
  GroupMemberRaw,
  SaveExplanationInput,
  SaveExplanationResult,
} from '@/lib/teach/contracts'
import type { ModerationStatus } from '@/types/db'

/**
 * Writing and deleting explanations, and holding a question while writing.
 *
 * Everything runs as the signed-in user, never the service role, so the
 * policies in 0024 decide what lands: a teacher writes only inside their
 * combos, an untrusted teacher's work waits for review, only staff take down
 * a live explanation. The checks here exist to turn a refusal into a sentence
 * a teacher can act on.
 *
 * Rows are written with an explicit insert or update, never upsert: the column
 * grants do not let a teacher update question_id, kind or author_id, which an
 * upsert's ON CONFLICT DO UPDATE would need.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INTENTS: readonly ExplanationIntent[] = ['draft', 'submit', 'keep']

type Db = Awaited<ReturnType<typeof createClient>>

interface ExistingRow {
  id: string
  question_id: string | null
  author_id: string | null
  kind: string
  status: ModerationStatus
  submitted_at: string | null
  body: unknown
  video_url: string | null
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

/** A database refusal, as something the teacher can act on. */
function explain(error: { code?: string; message: string }): string {
  if (error.code === '42501' || /row-level security/i.test(error.message)) {
    return 'You are not allowed to change this explanation.'
  }
  if (error.code === '23514') {
    return 'The explanation was refused: use a YouTube link for the video, and keep the writing under 300 kB.'
  }
  if (error.code === '23505') {
    return 'This explanation was just saved somewhere else, perhaps in another tab. Reload the page and try again.'
  }
  return 'The explanation could not be saved. Try again in a moment.'
}

/**
 * Saves the caller's explanation for a question, creating it on first save.
 *
 * intent:
 *   draft   keep working; students and reviewers do not see it
 *   submit  publish when trusted, otherwise send for review
 *   keep    change the body or video but not the state (a video landing
 *           after upload); a rejected explanation becomes a draft again
 *
 * With `solutionId`, staff edit that row — anyone's — and nothing new is
 * inserted. Returns how many published copies the explanation reaches.
 */
export async function upsertExplanation(input: SaveExplanationInput): Promise<SaveExplanationResult> {
  if (!UUID.test(input.questionId ?? '') || !INTENTS.includes(input.intent)) {
    return fail('That request was not understood.')
  }
  if (input.solutionId !== undefined && !UUID.test(input.solutionId)) {
    return fail('That request was not understood.')
  }

  const profile = await getCurrentProfile()
  if (!profile) return fail('Sign in first.')
  const staff = isStaff(profile)
  if (!isTeacher(profile) && !(staff && input.solutionId)) {
    return fail('Only teachers can write explanations.')
  }

  let body: Block[] | undefined
  if (input.body !== undefined) {
    const checked = explanationBlocksSchema.safeParse(input.body)
    if (!checked.success) {
      return fail(checked.error.issues[0]?.message ?? 'The explanation could not be read.')
    }
    body = checked.data
  }

  let videoUrl: string | null | undefined
  if (input.videoUrl !== undefined) {
    if (input.videoUrl === null || input.videoUrl.trim() === '') {
      videoUrl = null
    } else {
      const ref = parseYouTubeUrl(input.videoUrl)
      if (!ref) return fail('That is not a YouTube video link.')
      videoUrl = canonicalYouTubeUrl(ref)
    }
  }

  const supabase = await createClient()
  let current: ExistingRow | null = null
  let anchor = input.questionId

  if (input.solutionId) {
    const { data, error } = await supabase
      .from('solutions')
      .select('id, question_id, author_id, kind, status, submitted_at, body, video_url')
      .eq('id', input.solutionId)
      .maybeSingle<ExistingRow>()
    if (error) return fail(explain(error))
    if (!data) return fail('That explanation no longer exists.')
    if (!staff && data.author_id !== profile.id) return fail('You can only edit your own explanations.')
    current = data
    anchor = data.question_id ?? input.questionId
  } else {
    const { data: allowed, error: allowedError } = await supabase.rpc('can_teach_question', {
      qid: input.questionId,
    })
    if (allowedError) return fail(explain(allowedError))
    if (!allowed) return fail('You are not assigned to this question’s subject.')

    const { data: group, error: groupError } = await supabase.rpc('group_explanations', {
      qid: input.questionId,
    })
    if (groupError) return fail(explain(groupError))
    const rows = (group ?? []) as GroupExplanationRaw[]

    // The caller's own explanation in this group: preferably the one written
    // for this very question, else the newest on a copy elsewhere, else one
    // whose question has been deleted.
    const mine = rows.filter((row) => row.is_mine && row.kind === 'authored')
    const own =
      mine.find((row) => row.question_id === input.questionId) ??
      mine.find((row) => row.question_id !== null) ??
      mine[0]
    if (own) {
      current = {
        id: own.id,
        question_id: own.question_id,
        author_id: own.author_id,
        kind: own.kind,
        status: own.status,
        submitted_at: own.submitted_at,
        body: own.body,
        video_url: own.video_url,
      }
      anchor = own.question_id ?? input.questionId
    }

    // One teacher's live explanation covers the group. A second one would
    // show beside it on every copy, so only an admin may add another.
    const live = rows.find((row) => !row.is_mine && row.kind === 'authored' && row.status === 'approved')
    if (live && profile.role !== 'admin' && current?.status !== 'approved') {
      return fail(
        `${live.author_name ?? 'Another teacher'} has already published an explanation for this question. Ask an admin if it needs changing.`,
      )
    }
  }

  // An explanation whose question was deleted (an admin removed it, a
  // re-import dropped it) still shows on the copies, but the policies let a
  // teacher write only to a row anchored on a question. A draft or rejected
  // one moves onto this question; a live one is left to the admins.
  let orphan: ExistingRow | null = null
  if (current && current.question_id === null && current.kind === 'authored' && !staff) {
    if (current.status === 'approved') {
      return fail(
        'This explanation was written for a question that has since been removed, so only an admin can change it now.',
      )
    }
    orphan = current
    current = null
  }

  // What the saved row will hold: the new content, or what is there now.
  const base = current ?? orphan
  const finalBody = body ?? (base ? (base.body as unknown[]) : [])
  const finalVideo = videoUrl !== undefined ? videoUrl : (base?.video_url ?? null)
  const hasContent = (Array.isArray(finalBody) && finalBody.length > 0) || finalVideo !== null

  let status: ModerationStatus
  let submittedAt: string | null
  if (input.intent === 'submit') {
    if (!hasContent) return fail('Write an explanation or add a video before submitting.')
    let trusted = staff
    if (!trusted) {
      const { data, error } = await supabase.rpc('my_auto_publish')
      if (error) return fail(explain(error))
      trusted = data === true
    }
    status = trusted ? 'approved' : 'pending'
    submittedAt = new Date().toISOString()
  } else if (input.intent === 'draft') {
    if (current?.status === 'approved') {
      return fail('This explanation is live. Submit your changes instead, or ask an admin to unpublish it first.')
    }
    status = 'pending'
    submittedAt = null
  } else if (!base || base.status === 'rejected') {
    status = 'pending'
    submittedAt = null
  } else {
    // An untrusted teacher's change to a live explanation is sent back to
    // review by the database (solutions_review_guard), not here.
    status = base.status
    submittedAt = base.submitted_at
  }

  let saved: { id: string; status: ModerationStatus } | null
  if (!current) {
    const { data, error } = await supabase
      .from('solutions')
      .insert({
        question_id: input.questionId,
        kind: 'authored',
        body: finalBody,
        video_url: finalVideo,
        author_id: profile.id,
        status,
        submitted_at: submittedAt,
      })
      .select('id, status')
      .single<{ id: string; status: ModerationStatus }>()
    if (error) return fail(explain(error))
    saved = data
    // The moved orphan goes. Should this fail, the new row, anchored here,
    // is the one every later save picks.
    if (orphan) await supabase.from('solutions').delete().eq('id', orphan.id)
  } else {
    const patch: Record<string, unknown> = { status, submitted_at: submittedAt }
    if (body !== undefined) patch.body = body
    if (videoUrl !== undefined) patch.video_url = videoUrl
    const { data, error } = await supabase
      .from('solutions')
      .update(patch)
      .eq('id', current.id)
      .select('id, status')
      .maybeSingle<{ id: string; status: ModerationStatus }>()
    if (error) return fail(explain(error))
    if (!data) return fail('You can no longer edit this explanation.')
    saved = data
  }

  // Students only ever see live explanations, so only a change to or from
  // live empties their cache. Drafts and reviews cost no egress.
  if (saved.status === 'approved' || current?.status === 'approved') {
    refresh(TAG.solutions)
  }

  return { ok: true, solutionId: saved.id, status: saved.status, reach: await reach(supabase, anchor) }
}

/** How many published copies an explanation anchored on `questionId` shows on. */
async function reach(supabase: Db, questionId: string): Promise<number> {
  const { data, error } = await supabase.rpc('question_group_members', { qid: questionId })
  if (error || !Array.isArray(data)) return 1
  return Math.max(data.length, 1)
}

/**
 * Whether an answer-key report on this question, or on any copy of it the
 * caller can see, is still open. A teacher explaining a wrong key would
 * teach the wrong answer on every copy at once, so submitting waits.
 */
export async function answerKeyInDoubt(questionId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data: members } = await supabase.rpc('question_group_members', { qid: questionId })
  const ids = Array.from(
    new Set([questionId, ...((members ?? []) as GroupMemberRaw[]).map((member) => member.question_id)]),
  ).slice(0, 100)
  const { count, error } = await supabase
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'wrong_answer')
    .eq('status', 'open')
    .in('question_id', ids)
  if (error) {
    console.error(`answer-key check failed — ${error.message}`)
    return false
  }
  return (count ?? 0) > 0
}

/**
 * Whether the explanation a change would land on is live: the one named by
 * id (an admin editing someone else's), else any of the caller's own in the
 * question's group.
 */
export async function explanationIsLive(questionId: string, solutionId?: string): Promise<boolean> {
  const supabase = await createClient()
  if (solutionId) {
    const { data } = await supabase
      .from('solutions')
      .select('status')
      .eq('id', solutionId)
      .maybeSingle<{ status: ModerationStatus }>()
    return data?.status === 'approved'
  }
  const { data } = await supabase.rpc('group_explanations', { qid: questionId })
  return ((data ?? []) as GroupExplanationRaw[]).some(
    (row) => row.is_mine && row.kind === 'authored' && row.status === 'approved',
  )
}

/** The refusal for a new video on a live explanation while its answer key is in doubt. */
export const VIDEO_WAITS_FOR_KEY =
  'The answer key of this question has been reported as wrong, and this explanation is published. Attach the new video once an admin has resolved the report.'

/**
 * Deletes one explanation. An author may delete their own drafts and rejected
 * work; a live explanation comes down only through staff.
 */
export async function deleteExplanation(solutionId: string): Promise<ActionState> {
  if (!UUID.test(solutionId ?? '')) return { ok: false, error: 'That request was not understood.' }
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Sign in first.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('solutions')
    .delete()
    .eq('id', solutionId)
    .select('id, status')
    .returns<{ id: string; status: ModerationStatus }[]>()
  if (error) return { ok: false, error: explain(error) }
  if (!data?.length) {
    return {
      ok: false,
      error: 'Only your own drafts and rejected explanations can be deleted. Ask an admin to take down a published one.',
    }
  }

  if (data.some((row) => row.status === 'approved')) refresh(TAG.solutions)
  return { ok: true }
}

/**
 * Holds the question's group for the caller for 48 hours, or reports who
 * already holds it. An admin takes over someone else's hold only by asking.
 */
export async function claimQuestion(
  questionId: string,
  { takeOver = false }: { takeOver?: boolean } = {},
): Promise<ClaimResult> {
  const none: ClaimResult = { ok: false, holderName: null, expiresAt: null }
  if (!UUID.test(questionId ?? '')) return none

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('claim_question', { qid: questionId, p_take_over: takeOver })
  if (error || !Array.isArray(data) || !data[0]) return none

  const row = data[0] as { ok: boolean; holder_name: string | null; expires_at: string | null }
  return { ok: row.ok === true, holderName: row.holder_name, expiresAt: row.expires_at }
}

/** Lets go of the caller's hold on the question's group (an admin may release anyone's). */
export async function releaseClaim(questionId: string): Promise<void> {
  if (!UUID.test(questionId ?? '')) return
  const supabase = await createClient()
  await supabase.rpc('release_claim', { qid: questionId })
}
