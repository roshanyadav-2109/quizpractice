'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireTeacher } from '@/lib/supabase/server'
import { releaseClaim } from '@/lib/teach/explanations'
import { NotAssignedError, isUuid, nextQuestionFor } from '@/lib/teach/queries'
import { ROUTES } from '@/lib/teach/contracts'
import type { ActionState } from '@/app/admin/actions'

/**
 * The desk's two actions. Both run as the signed-in teacher: what they may
 * touch is decided by the database (release_claim, teacher_queue), and the
 * checks here only turn a refusal into a sentence.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Lets go of the caller's hold on a question's group (an admin may release anyone's). */
export async function releaseClaimAction(questionId: string): Promise<ActionState> {
  try {
    await requireTeacher()
  } catch {
    return { ok: false, error: 'This needs a teacher account.' }
  }
  if (!isUuid(questionId)) return { ok: false, error: 'That request was not understood.' }

  await releaseClaim(questionId)
  revalidatePath(ROUTES.teachHome, 'layout')
  return { ok: true }
}

/**
 * "Continue" on a combo card: opens the studio on the next thing to do in
 * the subject, or the queue when nothing is left. Worked out on the click
 * rather than when the desk renders, so the desk costs one query per combo
 * less and the answer is current.
 */
export async function continueAction(subjectId: string, subjectSlug: string): Promise<ActionState> {
  try {
    await requireTeacher()
  } catch {
    return { ok: false, error: 'This needs a teacher account.' }
  }
  if (!isUuid(subjectId) || !SLUG.test(subjectSlug)) {
    return { ok: false, error: 'That request was not understood.' }
  }

  let questionId: string | null
  try {
    questionId = await nextQuestionFor(subjectId)
  } catch (error) {
    if (error instanceof NotAssignedError) return { ok: false, error: error.message }
    console.error(error)
    return { ok: false, error: 'The next question could not be found. Try again in a moment.' }
  }

  // redirect() works by throwing, so it stays outside the try above. With
  // nothing left to start, the queue says so and points at what remains.
  redirect(questionId ? ROUTES.studio(questionId) : ROUTES.teachSubject(subjectSlug))
}
