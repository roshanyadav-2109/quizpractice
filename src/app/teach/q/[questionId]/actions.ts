'use server'

import { createClient, requireTeacher, type CurrentProfile } from '@/lib/supabase/server'
import {
  VIDEO_WAITS_FOR_KEY,
  answerKeyInDoubt,
  claimQuestion,
  explanationIsLive,
  releaseClaim,
  upsertExplanation,
} from '@/lib/teach/explanations'
import { validateYouTubeLink } from '@/lib/youtube/validate'
import type { ActionState } from '@/app/admin/actions'
import type {
  ClaimResult,
  ExplanationIntent,
  SaveExplanationInput,
  SaveExplanationResult,
} from '@/lib/teach/contracts'
import type { ModerationStatus } from '@/types/db'

/**
 * The studio's server actions. Each one checks who is calling before doing
 * anything, and then runs as that teacher: the database decides what they
 * may touch (can_teach_question, the solutions policies, claim_question), and
 * the checks here only turn a refusal into a sentence.
 *
 * Nothing here refreshes a page. The studio keeps its own state from what
 * each action returns, and re-rendering it after every save would read the
 * whole group's explanations again for nothing. The one cache that matters,
 * the students' explanations, is refreshed inside upsertExplanation when a
 * live explanation changes.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INTENTS: readonly ExplanationIntent[] = ['draft', 'submit', 'keep']
const NOT_UNDERSTOOD = 'That request was not understood.'

type Teacher = { profile: CurrentProfile } | { error: string }

async function teacher(): Promise<Teacher> {
  try {
    return { profile: await requireTeacher() }
  } catch {
    return { error: 'This needs a teacher account. Sign in again if you are one.' }
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/**
 * A solutionId names someone else's explanation for an admin to edit. The
 * studio sends one only then; a teacher's own explanation is found from the
 * question, where the one-live-explanation-per-question rule is checked.
 */
function solutionIdAllowed(solutionId: unknown, profile: CurrentProfile): boolean {
  return solutionId === undefined || (isUuid(solutionId) && profile.role === 'admin')
}

/**
 * Saves the written explanation: a draft, or a submission (published at
 * once for a trusted teacher, otherwise sent for review). The video is never
 * set here — only attachVideoAction sets it, after checking the link with
 * YouTube.
 */
export async function saveExplanationAction(input: SaveExplanationInput): Promise<SaveExplanationResult> {
  const who = await teacher()
  if ('error' in who) return { ok: false, error: who.error }

  if (!input || !isUuid(input.questionId) || !INTENTS.includes(input.intent)) {
    return { ok: false, error: NOT_UNDERSTOOD }
  }
  if (input.body !== undefined && !Array.isArray(input.body)) return { ok: false, error: NOT_UNDERSTOOD }
  if (!solutionIdAllowed(input.solutionId, who.profile)) return { ok: false, error: NOT_UNDERSTOOD }

  if (input.intent === 'submit' && (await answerKeyInDoubt(input.questionId))) {
    return {
      ok: false,
      error:
        'The answer key of this question has been reported as wrong. Save a draft for now; you can submit once an admin has resolved the report.',
    }
  }

  return upsertExplanation({
    questionId: input.questionId,
    body: input.body,
    intent: input.intent,
    ...(input.solutionId ? { solutionId: input.solutionId } : {}),
  })
}

export type AttachVideoResult =
  | {
      ok: true
      url: string
      title: string
      channelTitle: string
      warnings: string[]
      solutionId: string
      status: ModerationStatus
      reach: number
    }
  | { ok: false; error: string }

/**
 * Attaches a YouTube video to the explanation, after checking with YouTube
 * that it is on the channel, not Private, and allowed to be embedded. A
 * start time in the link is kept, so one long recording can serve several
 * questions.
 */
export async function attachVideoAction(
  questionId: string,
  url: string,
  solutionId?: string,
): Promise<AttachVideoResult> {
  const who = await teacher()
  if ('error' in who) return { ok: false, error: who.error }
  if (!isUuid(questionId) || typeof url !== 'string' || url.length > 500) return { ok: false, error: NOT_UNDERSTOOD }
  if (!solutionIdAllowed(solutionId, who.profile)) return { ok: false, error: NOT_UNDERSTOOD }
  if (!url.trim()) return { ok: false, error: 'Paste the video’s link first.' }

  // A new video on a live explanation goes out at once, so while the answer
  // key is in doubt it waits, as submitting does. A draft may take it now.
  if ((await answerKeyInDoubt(questionId)) && (await explanationIsLive(questionId, solutionId))) {
    return { ok: false, error: VIDEO_WAITS_FOR_KEY }
  }

  const check = await validateYouTubeLink(url)
  if (!check.ok) return check

  const saved = await upsertExplanation({
    questionId,
    videoUrl: check.url,
    intent: 'keep',
    ...(solutionId ? { solutionId } : {}),
  })
  if (!saved.ok) return saved

  return {
    ok: true,
    url: check.url,
    title: check.title,
    channelTitle: check.channelTitle,
    warnings: check.warnings,
    solutionId: saved.solutionId,
    status: saved.status,
    reach: saved.reach,
  }
}

/** Takes the video off the explanation; the video itself stays on YouTube. */
export async function removeVideoAction(questionId: string, solutionId?: string): Promise<SaveExplanationResult> {
  const who = await teacher()
  if ('error' in who) return { ok: false, error: who.error }
  if (!isUuid(questionId)) return { ok: false, error: NOT_UNDERSTOOD }
  if (!solutionIdAllowed(solutionId, who.profile)) return { ok: false, error: NOT_UNDERSTOOD }

  return upsertExplanation({ questionId, videoUrl: null, intent: 'keep', ...(solutionId ? { solutionId } : {}) })
}

/**
 * Holds the question's group for the caller, or renews their hold. The
 * studio calls it on the first edit, recording or save — never just for
 * opening the page — and again every so often while the teacher works.
 * `takeOver` is an admin's explicit "Take over"; the database ignores it for
 * anyone else.
 */
export async function claimAction(questionId: string, takeOver = false): Promise<ClaimResult> {
  const who = await teacher()
  if ('error' in who || !isUuid(questionId)) return { ok: false, holderName: null, expiresAt: null }
  return claimQuestion(questionId, { takeOver: takeOver === true && who.profile.role === 'admin' })
}

/** Lets go of the caller's hold (an admin may release anyone's). */
export async function releaseAction(questionId: string): Promise<ActionState> {
  const who = await teacher()
  if ('error' in who) return { ok: false, error: who.error }
  if (!isUuid(questionId)) return { ok: false, error: NOT_UNDERSTOOD }
  await releaseClaim(questionId)
  return { ok: true }
}

export type ReportAnswerKeyResult =
  | { ok: true; report: { id: string; createdAt: string; description: string; mine: true } }
  | { ok: false; error: string }

/**
 * Reports the question's answer key as wrong, into the same queue students'
 * reports go to (Admin → Reports). Until an admin resolves it, the studio
 * lets the teacher save drafts but not submit.
 */
export async function reportAnswerKeyAction(questionId: string, description: string): Promise<ReportAnswerKeyResult> {
  const who = await teacher()
  if ('error' in who) return { ok: false, error: who.error }
  if (!isUuid(questionId) || typeof description !== 'string') return { ok: false, error: NOT_UNDERSTOOD }
  const text = description.trim()
  if (text.length < 10) return { ok: false, error: 'Say what is wrong with the marked answer, and what it should be.' }
  if (text.length > 2000) return { ok: false, error: 'Keep the report under 2,000 characters.' }

  const supabase = await createClient()
  const { data: allowed } = await supabase.rpc('can_teach_question', { qid: questionId })
  if (allowed !== true) return { ok: false, error: 'You are not assigned to this question’s subject.' }

  const { data, error } = await supabase
    .from('reports')
    .insert({
      question_id: questionId,
      user_id: who.profile.id,
      kind: 'wrong_answer',
      description: `From the explanation studio: ${text}`,
    })
    .select('id, created_at, description')
    .single<{ id: string; created_at: string; description: string }>()
  if (error || !data) return { ok: false, error: 'The report could not be sent. Try again in a moment.' }

  return { ok: true, report: { id: data.id, createdAt: data.created_at, description: data.description, mine: true } }
}
