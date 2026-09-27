'use server'

import { revalidatePath } from 'next/cache'
import { createClient, forgetProfile, requireAdmin, type CurrentProfile } from '@/lib/supabase/server'
import { ROUTES } from '@/lib/teach/contracts'
import type { ActionState } from '@/app/admin/actions'
import type { UserRole } from '@/types/db'

/**
 * Who teaches what: roles, the "publish without review" flag, and each
 * teacher's branch + subject combos. Admins only.
 *
 * Every action runs as the signed-in admin, and the database checks again:
 * set_user_role() and set_auto_publish() refuse anyone but an admin, and a
 * trigger on teacher_assignments refuses a subject outside the named branch
 * whatever sent the row. The checks here only turn a refusal into a sentence.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Roles an admin hands out here. Making or unmaking an admin stays in the Supabase dashboard. */
const ASSIGNABLE_ROLES: readonly UserRole[] = ['student', 'teacher', 'contributor']

const NOT_ADMIN = 'Only an admin can manage educators.'

function fail(error: string): ActionState {
  return { ok: false, error }
}

async function adminOrNull(): Promise<CurrentProfile | null> {
  try {
    return await requireAdmin()
  } catch {
    return null
  }
}

/** A database refusal, as something the admin can act on. */
function explain(error: { code?: string; message: string }, fallback: string): string {
  switch (error.code) {
    // The guards in 0024 raise these with a sentence meant to be shown.
    case '42501':
      return /row-level security|permission denied/i.test(error.message) ? NOT_ADMIN : error.message
    case '23514':
    case '22023':
    case 'P0002':
      return error.message
    case '23505':
      return 'That teacher already has this subject.'
    case '23503':
      return /violates/i.test(error.message) ? 'That person or subject no longer exists.' : error.message
    default:
      return `${fallback} (${error.message})`
  }
}

/**
 * Makes someone a student, teacher or contributor. Taking the teacher role
 * away also drops their combos, their claims and their trust flag (the
 * database does that); their explanations stay.
 */
export async function setRole(userId: string, role: UserRole): Promise<ActionState> {
  const admin = await adminOrNull()
  if (!admin) return fail(NOT_ADMIN)
  if (!UUID.test(userId ?? '')) return fail('That person was not found.')
  if (!ASSIGNABLE_ROLES.includes(role)) return fail('Pick student, teacher or contributor.')
  if (userId === admin.id) return fail('You cannot change your own role.')

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_user_role', { target: userId, new_role: role })
  if (error) return fail(explain(error, 'The role could not be changed.'))

  // This server's held copy of their profile would otherwise answer with the
  // old role for up to a minute. Other servers catch up on their own; the
  // database enforces the new role everywhere at once.
  forgetProfile(userId)
  revalidatePath(ROUTES.adminEducators)
  return { ok: true }
}

/** Lets a teacher's submissions go live without review, or sends them back through it. */
export async function setAutoPublish(userId: string, value: boolean): Promise<ActionState> {
  if (!(await adminOrNull())) return fail(NOT_ADMIN)
  if (!UUID.test(userId ?? '')) return fail('That person was not found.')
  if (typeof value !== 'boolean') return fail('That request was not understood.')

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_auto_publish', { target: userId, value })
  if (error) return fail(explain(error, 'The setting could not be changed.'))

  revalidatePath(ROUTES.adminEducators)
  return { ok: true }
}

/**
 * Gives a teacher one subject within one branch. The subject must belong to
 * that branch: checked here first for a clear message, and again by the
 * database, which has the final word.
 */
export async function addAssignment(teacherId: string, programId: string, subjectId: string): Promise<ActionState> {
  const admin = await adminOrNull()
  if (!admin) return fail(NOT_ADMIN)
  if (!UUID.test(teacherId ?? '')) return fail('That teacher was not found.')
  if (!UUID.test(programId ?? '')) return fail('Choose a branch.')
  if (!UUID.test(subjectId ?? '')) return fail('Choose a subject.')

  const supabase = await createClient()
  const { data: subject, error: subjectError } = await supabase
    .from('subjects')
    .select('id, levels!inner(program_id)')
    .eq('id', subjectId)
    .maybeSingle<{ id: string; levels: { program_id: string } | null }>()
  if (subjectError) return fail(explain(subjectError, 'The subject could not be checked.'))
  if (!subject || !subject.levels) return fail('That subject no longer exists.')
  if (subject.levels.program_id !== programId) return fail('That subject is not part of this branch.')

  const { error } = await supabase.from('teacher_assignments').insert({
    teacher_id: teacherId,
    program_id: programId,
    subject_id: subjectId,
    assigned_by: admin.id,
  })
  if (error) return fail(explain(error, 'The subject could not be assigned.'))

  revalidatePath(ROUTES.adminEducators)
  return { ok: true }
}

/** Takes one subject away from a teacher. Their explanations in it stay. */
export async function removeAssignment(teacherId: string, subjectId: string): Promise<ActionState> {
  if (!(await adminOrNull())) return fail(NOT_ADMIN)
  if (!UUID.test(teacherId ?? '') || !UUID.test(subjectId ?? '')) return fail('That subject was not found.')

  const supabase = await createClient()
  const { error } = await supabase
    .from('teacher_assignments')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('subject_id', subjectId)
  if (error) return fail(explain(error, 'The subject could not be removed.'))

  revalidatePath(ROUTES.adminEducators)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Access by email (0027): invite someone before they have ever signed in
// ---------------------------------------------------------------------------

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Roles an invite can carry. Admin stays a dashboard job, as with setRole. */
const INVITABLE_ROLES: readonly UserRole[] = ['teacher', 'contributor']

function cleanEmail(raw: string): string | null {
  const email = (raw ?? '').trim().toLowerCase()
  return email.length <= 254 && EMAIL.test(email) ? email : null
}

/**
 * Gives an email address a role. Someone who has already signed in gets it at
 * once ('applied'); anyone else gets it the first time they sign in with that
 * Google address ('invited').
 */
export async function inviteByEmail(rawEmail: string, role: UserRole): Promise<ActionState & { applied?: boolean }> {
  if (!(await adminOrNull())) return fail(NOT_ADMIN)
  const email = cleanEmail(rawEmail)
  if (!email) return fail('That is not an email address.')
  if (!INVITABLE_ROLES.includes(role)) return fail('Invite someone as a teacher or a contributor.')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_invite', { p_email: email, p_role: role })
  if (error) return fail(explain(error, 'The invite could not be saved.'))

  revalidatePath(ROUTES.adminEducators)
  return { ok: true, applied: data === 'applied' }
}

/** Withdraws an invite that has not been used yet, with its subjects. */
export async function cancelInvite(rawEmail: string): Promise<ActionState> {
  if (!(await adminOrNull())) return fail(NOT_ADMIN)
  const email = cleanEmail(rawEmail)
  if (!email) return fail('That invite was not found.')

  const supabase = await createClient()
  const { error } = await supabase.from('access_invites').delete().eq('email', email)
  if (error) return fail(explain(error, 'The invite could not be cancelled.'))

  revalidatePath(ROUTES.adminEducators)
  return { ok: true }
}

/** A branch + subject combo waiting on a teacher invite; applied with the role at first sign-in. */
export async function addInviteAssignment(rawEmail: string, programId: string, subjectId: string): Promise<ActionState> {
  if (!(await adminOrNull())) return fail(NOT_ADMIN)
  const email = cleanEmail(rawEmail)
  if (!email) return fail('That invite was not found.')
  if (!UUID.test(programId ?? '')) return fail('Choose a branch.')
  if (!UUID.test(subjectId ?? '')) return fail('Choose a subject.')

  const supabase = await createClient()
  const { error } = await supabase
    .from('invite_assignments')
    .insert({ email, program_id: programId, subject_id: subjectId })
  if (error) {
    return fail(error.code === '23505' ? 'That invite already has this subject.' : explain(error, 'The subject could not be added.'))
  }

  revalidatePath(ROUTES.adminEducators)
  return { ok: true }
}

export async function removeInviteAssignment(rawEmail: string, subjectId: string): Promise<ActionState> {
  if (!(await adminOrNull())) return fail(NOT_ADMIN)
  const email = cleanEmail(rawEmail)
  if (!email || !UUID.test(subjectId ?? '')) return fail('That subject was not found.')

  const supabase = await createClient()
  const { error } = await supabase.from('invite_assignments').delete().eq('email', email).eq('subject_id', subjectId)
  if (error) return fail(explain(error, 'The subject could not be removed.'))

  revalidatePath(ROUTES.adminEducators)
  return { ok: true }
}
